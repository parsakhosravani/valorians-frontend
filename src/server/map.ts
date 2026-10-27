import "server-only";

import { getDb } from "./db";
import { Player, avatarUrl } from "./players";

import { storedFlag } from "@/lib/game/clan";
import { advance, normalizeState } from "@/lib/game/engine";
import { campDefense, MAX_CAMP_LEVEL } from "@/lib/game/config";
import { CAMP_REACH, MAX_RING, Point, campPositions, distance, homeSlot, isCoastal, settledShare, terrainAt } from "@/lib/game/map";
import { campReward, campStatus, powerScore, scoutEstimate } from "@/lib/game/war";
import { BattleRound, nextRoundAt, roundsSoFar } from "@/lib/game/battle";
import type { StoredBattle } from "./war";

/**
 * A tribe's home tile, settling it on the map the first time it is needed.
 *
 * New tribes take the next free spot on the spiral out from the middle
 * (`homeSlot`). The spiral index to start from is kept in meta, so each new
 * tribe picks up where the last one settled. (Starting from the number of
 * tribes, as before, fell behind the spiral: slots on water or mountains are
 * skipped, so after a few hundred tribes every slot it tried was taken.)
 */
export async function homeOf(id: number): Promise<Point> {
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT map_x, map_y FROM users WHERE id = ?", args: [id] });
  const row = rs.rows[0];

  if (row && row.map_x != null) return { x: Number(row.map_x), y: Number(row.map_y) };

  const taken = new Set(
    (await db.execute("SELECT map_x, map_y FROM users WHERE map_x IS NOT NULL")).rows.map(
      (r) => `${Number(r.map_x)},${Number(r.map_y)}`,
    ),
  );
  const cursor = Number((await db.execute("SELECT value FROM meta WHERE key = 'spiral_next'")).rows[0]?.value ?? 0);
  // Every spiral slot inside the world, with room to skip the unusable ones.
  const last = (2 * MAX_RING + 1) ** 2 + 60;

  for (let n = cursor; n < last; n++) {
    const p = homeSlot(n);

    if (taken.has(`${p.x},${p.y}`)) continue;
    // Settle here unless someone else took the tile (or settled us) meanwhile.
    const up = await db.execute({
      sql: `UPDATE users SET map_x = ?, map_y = ? WHERE id = ? AND map_x IS NULL
            AND NOT EXISTS (SELECT 1 FROM users WHERE map_x = ? AND map_y = ?)`,
      args: [p.x, p.y, id, p.x, p.y],
    });

    if (up.rowsAffected === 1) {
      await db.execute({
        sql: "INSERT INTO meta (key, value) VALUES ('spiral_next', ?) ON CONFLICT(key) DO UPDATE SET value = MAX(CAST(value AS INTEGER), CAST(excluded.value AS INTEGER))",
        args: [String(n + 1)],
      });
      await warnIfFilling(settledShare(p));

      return p;
    }
    const again = await db.execute({ sql: "SELECT map_x FROM users WHERE id = ?", args: [id] });

    if (again.rows[0]?.map_x != null) return homeOf(id);
    taken.add(`${p.x},${p.y}`);
  }
  await warnIfFilling(1);
  throw new Error("No free land left on the map");
}

/**
 * Tells the admins (on Telegram) when the world is getting full: once at
 * 80%, once at 95%, and when it's completely full. Never twice for the same step.
 */
async function warnIfFilling(share: number) {
  const step = share >= 1 ? 100 : share >= 0.95 ? 95 : share >= 0.8 ? 80 : 0;

  if (!step) return;
  const db = await getDb();
  const done = Number((await db.execute("SELECT value FROM meta WHERE key = 'map_full_warned'")).rows[0]?.value ?? 0);

  if (done >= step) return;
  // Claim this step first, so two settlers at once don't both send it.
  const claim = await db.execute({
    sql: `INSERT INTO meta (key, value) VALUES ('map_full_warned', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(meta.value AS INTEGER) < ?`,
    args: [String(step), step],
  });

  if (!claim.rowsAffected) return;
  const { adminIds } = await import("./announce");
  const { sendToPlayer } = await import("./notify");
  const text =
    step === 100
      ? "🗺️ <b>The world map is full.</b> New players can't be given a home until the map grows."
      : `🗺️ <b>The world map is ${step}% full.</b> Time to plan more land before new players run out of room.`;

  for (const admin of await adminIds()) await sendToPlayer(admin, text, "🗺️ Open the map", "/battle");
}

/** Gives every tribe without a home tile one, oldest first, so they show on the map. */
async function settleAll() {
  const db = await getDb();
  const rs = await db.execute("SELECT id FROM users WHERE map_x IS NULL ORDER BY created_at ASC LIMIT 100");

  for (const r of rs.rows) await homeOf(Number(r.id));
}

/**
 * Where a player's camps 1..`upTo` sit. Tribes' tiles around home are
 * off-limits, so a camp never hides under a village. Map and marches both
 * use this, so they always agree.
 */
export async function campSpots(playerId: number, home: Point, upTo: number): Promise<Point[]> {
  const db = await getDb();
  const r = CAMP_REACH(MAX_CAMP_LEVEL);
  const rs = await db.execute({
    sql: "SELECT map_x, map_y FROM users WHERE map_x BETWEEN ? AND ? AND map_y BETWEEN ? AND ?",
    args: [home.x - r, home.x + r, home.y - r, home.y + r],
  });
  const tribes = rs.rows.map((row) => ({ x: Number(row.map_x), y: Number(row.map_y) }));

  return campPositions(playerId, home, upTo, tribes);
}

export const VIEW_RADIUS = 14;

type Movement = {
  id: number;
  kind: "outgoing" | "incoming";
  from: Point & { name: string };
  to: Point & { name: string };
  sentAt: number;
  arrivesAt: number;
  /** Visible to defenders with a Watchtower; always for your own armies (and once the fight is on). */
  units: Record<string, number> | null;
  campLevel: number | null;
  /** The army reached its target and the battle is being fought. */
  battle: LiveBattle | null;
  /** Your own armies: spoils carried from an earlier battle, and new orders taken on this expedition. */
  loot?: Record<string, number> | null;
  coins?: number;
  hops?: number;
};

/** A battle under way, as far as it has gone: later rounds stay secret until they're fought. */
type LiveBattle = {
  startedAt: number;
  endsAt: number;
  totalRounds: number;
  rounds: BattleRound[];
  nextRoundAt: number | null;
  /** The defenders on the field (none at a barbarian camp). */
  defenders: Record<string, number> | null;
};

type Caravan = {
  id: string;
  /** Relative to you: goods coming home, your goods going out, or someone else's. */
  kind: "coming" | "going" | "other";
  from: Point & { name: string };
  to: Point & { name: string };
  resource: string;
  amount: number;
  sentAt: number;
  arrivesAt: number;
};

/** Everything the War map shows around a point (your home by default). */
export async function mapView(me: Player, now: number, center?: Point, radius = VIEW_RADIUS) {
  await settleAll();
  const home = await homeOf(me.id);
  const c = center ?? home;
  const db = await getDb();
  const r = Math.max(8, Math.min(30, Math.round(radius) || VIEW_RADIUS));

  const rs = await db.execute({
    sql: `SELECT u.id, u.username, u.first_name, u.photo_url, u.population, u.power, u.shield_until, u.map_x, u.map_y, u.state,
                 u.clan_id, c.tag AS clan_tag, c.flag AS clan_flag
          FROM users u LEFT JOIN clans c ON c.id = u.clan_id
          WHERE u.map_x BETWEEN ? AND ? AND u.map_y BETWEEN ? AND ?`,
    args: [c.x - r, c.x + r, c.y - r, c.y + r],
  });
  const tribes = rs.rows.map((row) => {
    const id = Number(row.id);
    const p = { x: Number(row.map_x), y: Number(row.map_y) };
    const s = advance(normalizeState(JSON.parse(String(row.state))), now);

    return {
      id,
      name: String(row.first_name || (row.username ? `@${row.username}` : "Player")),
      photoUrl: avatarUrl(id),
      x: p.x,
      y: p.y,
      isMe: id === me.id,
      population: Math.floor(Number(row.population)),
      power: Math.round(Number(row.power)),
      townHall: s.buildings["town-hall"] ?? 0,
      /** On the sea's edge: can be attacked from the sea, and fights better there. */
      coastal: isCoastal(p),
      /** Harbors are seen from afar; each level makes landings harder. */
      harbor: s.buildings["harbor"] ?? 0,
      shieldUntil: Number(row.shield_until),
      terrain: terrainAt(p.x, p.y),
      distance: Math.round(distance(home, p) * 10) / 10,
      defense: id === me.id ? null : scoutEstimate(s, me.state),
      clan:
        row.clan_id == null
          ? null
          : { id: Number(row.clan_id), tag: String(row.clan_tag ?? ""), flag: storedFlag(row.clan_flag, Number(row.clan_id)) },
      /** In the viewer's clan: can't be attacked. */
      ally: id !== me.id && me.clanId != null && Number(row.clan_id) === me.clanId,
    };
  });

  // Your own barbarian camps: beaten ones, the next one, and two you can see beyond.
  const shown = Math.min(MAX_CAMP_LEVEL, me.state.camps.cleared + 3);
  const spots = await campSpots(me.id, home, shown);
  const camps = spots.map((p, i) => {
    const level = i + 1;
    const st = campStatus(me.state, level, now);

    return {
      level,
      x: p.x,
      y: p.y,
      state: st.state,
      readyAt: st.readyAt,
      defense: campDefense(level),
      reward: campReward(me.state, level),
      terrain: terrainAt(p.x, p.y),
      distance: Math.round(distance(home, p) * 10) / 10,
    };
  });

  // Armies on the move that concern you.
  const mv = await db.execute({
    sql: `SELECT a.*, au.first_name AS a_name, du.first_name AS d_name
          FROM attacks a
          LEFT JOIN users au ON au.id = a.attacker_id
          LEFT JOIN users du ON du.id = a.defender_id
          WHERE a.status IN ('marching', 'resolving', 'fighting') AND (a.attacker_id = ? OR a.defender_id = ?)
          ORDER BY a.arrives_at ASC`,
    args: [me.id, me.id],
  });
  const watch = (me.state.buildings["watchtower"] ?? 0) >= 1;
  const movements: Movement[] = mv.rows.map((a) => {
    const outgoing = Number(a.attacker_id) === me.id;
    const campLevel = a.camp_level == null ? null : Number(a.camp_level);
    const stored = a.status === "fighting" && a.battle != null ? (JSON.parse(String(a.battle)) as StoredBattle) : null;
    const battle: LiveBattle | null = stored
      ? {
          startedAt: stored.plan.startedAt,
          endsAt: stored.plan.endsAt,
          totalRounds: stored.plan.rounds.length,
          rounds: roundsSoFar(stored.plan, now),
          nextRoundAt: nextRoundAt(stored.plan, now),
          defenders: stored.engaged,
        }
      : null;

    return {
      id: Number(a.id),
      kind: outgoing ? "outgoing" : "incoming",
      from: { x: Number(a.from_x), y: Number(a.from_y), name: outgoing ? "Your tribe" : String(a.a_name || "A tribe") },
      to: {
        x: Number(a.to_x),
        y: Number(a.to_y),
        name: campLevel ? `Barbarian camp ${campLevel}` : outgoing ? String(a.d_name || "A tribe") : "Your tribe",
      },
      sentAt: Number(a.sent_at),
      arrivesAt: Number(a.arrives_at),
      units: outgoing || watch || battle ? JSON.parse(String(a.units)) : null,
      campLevel,
      battle,
      // Your own army after new orders: the spoils it carries and how many orders it took.
      ...(outgoing
        ? {
            loot: a.loot == null ? null : JSON.parse(String(a.loot)),
            coins: Number(a.coins ?? 0),
            hops: Number(a.hops ?? 0),
          }
        : {}),
    };
  });

  // Merchant caravans on the road: every accepted trade sends two loads, one
  // each way. Yours always show; other tribes' show when they pass through view.
  const tr = await db.execute({
    sql: `SELECT t.id, t.seller_id, t.buyer_id, t.give, t.give_amount, t.want, t.want_amount,
                 t.accepted_at, t.arrives_at,
                 su.first_name AS s_name, su.map_x AS s_x, su.map_y AS s_y,
                 bu.first_name AS b_name, bu.map_x AS b_x, bu.map_y AS b_y
          FROM trades t
          JOIN users su ON su.id = t.seller_id
          JOIN users bu ON bu.id = t.buyer_id
          WHERE t.status IN ('accepted', 'delivering') AND su.map_x IS NOT NULL AND bu.map_x IS NOT NULL
            AND (t.seller_id = ? OR t.buyer_id = ?
                 OR (su.map_x BETWEEN ? AND ? AND su.map_y BETWEEN ? AND ?)
                 OR (bu.map_x BETWEEN ? AND ? AND bu.map_y BETWEEN ? AND ?))
          ORDER BY t.arrives_at ASC LIMIT 40`,
    args: [me.id, me.id, c.x - r, c.x + r, c.y - r, c.y + r, c.x - r, c.x + r, c.y - r, c.y + r],
  });
  const caravans: Caravan[] = tr.rows.flatMap((t) => {
    const seller = { id: Number(t.seller_id), x: Number(t.s_x), y: Number(t.s_y), name: String(t.s_name || "A tribe") };
    const buyer = { id: Number(t.buyer_id), x: Number(t.b_x), y: Number(t.b_y), name: String(t.b_name || "A tribe") };
    const leg = (
      from: typeof seller,
      to: typeof seller,
      resource: string,
      amount: number,
      side: "a" | "b",
    ): Caravan => ({
      id: `${t.id}${side}`,
      kind: to.id === me.id ? "coming" : from.id === me.id ? "going" : "other",
      from: { x: from.x, y: from.y, name: from.id === me.id ? "Your tribe" : from.name },
      to: { x: to.x, y: to.y, name: to.id === me.id ? "Your tribe" : to.name },
      resource,
      amount: Number(amount),
      sentAt: Number(t.accepted_at),
      arrivesAt: Number(t.arrives_at),
    });

    return [
      leg(seller, buyer, String(t.give), Number(t.give_amount), "a"),
      leg(buyer, seller, String(t.want), Number(t.want_amount), "b"),
    ];
  });

  return {
    home,
    center: c,
    radius: r,
    tribes,
    camps,
    movements,
    caravans,
    myPower: powerScore(me.state),
  };
}
