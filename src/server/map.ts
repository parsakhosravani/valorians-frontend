import "server-only";

import { getDb } from "./db";
import { Player } from "./players";

import { advance } from "@/lib/game/engine";
import { campDefense, MAX_CAMP_LEVEL } from "@/lib/game/config";
import { Point, campPosition, distance, homeSlot, terrainAt } from "@/lib/game/map";
import { campReward, campStatus, powerScore, scoutEstimate } from "@/lib/game/war";

/** A tribe's home tile, settling it on the map the first time it is needed. */
export async function homeOf(id: number): Promise<Point> {
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT map_x, map_y FROM users WHERE id = ?", args: [id] });
  const row = rs.rows[0];

  if (row && row.map_x != null) return { x: Number(row.map_x), y: Number(row.map_y) };

  const count = Number((await db.execute("SELECT COUNT(*) AS n FROM users WHERE map_x IS NOT NULL")).rows[0].n);

  for (let n = count; n < count + 200; n++) {
    const p = homeSlot(n);
    const taken = await db.execute({ sql: "SELECT 1 FROM users WHERE map_x = ? AND map_y = ? LIMIT 1", args: [p.x, p.y] });

    if (taken.rows.length) continue;
    const up = await db.execute({
      sql: "UPDATE users SET map_x = ?, map_y = ? WHERE id = ? AND map_x IS NULL",
      args: [p.x, p.y, id],
    });

    if (up.rowsAffected === 1) return p;

    // Someone else settled us meanwhile.
    return homeOf(id);
  }
  throw new Error("No free land left on the map");
}

/** Gives every tribe without a home tile one, oldest first, so they show on the map. */
async function settleAll() {
  const db = await getDb();
  const rs = await db.execute("SELECT id FROM users WHERE map_x IS NULL ORDER BY created_at ASC LIMIT 100");

  for (const r of rs.rows) await homeOf(Number(r.id));
}

export const VIEW_RADIUS = 14;

type Movement = {
  id: number;
  kind: "outgoing" | "incoming";
  from: Point & { name: string };
  to: Point & { name: string };
  sentAt: number;
  arrivesAt: number;
  /** Visible to defenders with a Watchtower; always for your own armies. */
  units: Record<string, number> | null;
  campLevel: number | null;
};

/** Everything the War map shows around a point (your home by default). */
export async function mapView(me: Player, now: number, center?: Point, radius = VIEW_RADIUS) {
  await settleAll();
  const home = await homeOf(me.id);
  const c = center ?? home;
  const db = await getDb();
  const r = Math.max(8, Math.min(30, Math.round(radius) || VIEW_RADIUS));

  const rs = await db.execute({
    sql: `SELECT id, username, first_name, photo_url, population, power, shield_until, map_x, map_y, state
          FROM users WHERE map_x BETWEEN ? AND ? AND map_y BETWEEN ? AND ?`,
    args: [c.x - r, c.x + r, c.y - r, c.y + r],
  });
  const tribes = rs.rows.map((row) => {
    const id = Number(row.id);
    const p = { x: Number(row.map_x), y: Number(row.map_y) };
    const s = advance(JSON.parse(String(row.state)), now);

    return {
      id,
      name: String(row.first_name || (row.username ? `@${row.username}` : "Player")),
      photoUrl: row.photo_url == null ? null : String(row.photo_url),
      x: p.x,
      y: p.y,
      isMe: id === me.id,
      population: Math.floor(Number(row.population)),
      power: Math.round(Number(row.power)),
      townHall: s.buildings["town-hall"] ?? 0,
      shieldUntil: Number(row.shield_until),
      terrain: terrainAt(p.x, p.y),
      distance: Math.round(distance(home, p) * 10) / 10,
      defense: id === me.id ? null : scoutEstimate(s, me.state),
    };
  });

  // Your own barbarian camps: beaten ones, the next one, and two you can see beyond.
  const shown = Math.min(MAX_CAMP_LEVEL, me.state.camps.cleared + 3);
  const camps = Array.from({ length: shown }, (_, i) => i + 1).map((level) => {
    const p = campPosition(me.id, level, home);
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
          WHERE a.status IN ('marching', 'resolving') AND (a.attacker_id = ? OR a.defender_id = ?)
          ORDER BY a.arrives_at ASC`,
    args: [me.id, me.id],
  });
  const watch = (me.state.buildings["watchtower"] ?? 0) >= 1;
  const movements: Movement[] = mv.rows.map((a) => {
    const outgoing = Number(a.attacker_id) === me.id;
    const campLevel = a.camp_level == null ? null : Number(a.camp_level);

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
      units: outgoing || watch ? JSON.parse(String(a.units)) : null,
      campLevel,
    };
  });

  return {
    home,
    center: c,
    radius: r,
    tribes,
    camps,
    movements,
    myPower: powerScore(me.state),
  };
}
