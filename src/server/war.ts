import "server-only";

import crypto from "crypto";

import { clearLair, exposureOn, lairAt, lairManned } from "./bandits";
import { getDb } from "./db";
import { campSpots, homeOf } from "./map";
import { notify } from "./notify";
import { Player, avatarUrl, findById, mutatePlayer } from "./players";
import { maybeRefreshRanks } from "./ranks";
import { spiesSeeMarch } from "./spies";
import { errorData, logEvent, withEventContext } from "./events";
import { alertClan, rallyLanding, recordForClan, reconcileSupport, relationBetween, scoreWar } from "./clanWar";
import { blocksRaids } from "@/lib/game/clanWar";

import { GameError, advance, emptyArmy, getRates, peopleOf, rankForXp, shieldStops } from "@/lib/game/engine";
import { CAMP_DEFENSE_PER_TROOP, EMPTY_VILLAGE_DEFENSE_PER_TROOP, campName, MAX_LOOT_SHARE, MAX_MARCHES, RESOURCE_IDS, UNIT_IDS, banditStrength, campDefense } from "@/lib/game/config";
import { Ambush, afterAmbush, rollAmbush, spoilsTaken } from "@/lib/game/bandits";
import { BattlePlan, battleSize, joinDeadline, planBattle, reinforceAttack, reinforceBattle, troopsOnField } from "@/lib/game/battle";
import { Point, distance, pointAlong, routeFor, routeMs, routeTimeline, scoutCost, seaRoute, terrainAt } from "@/lib/game/map";
import {
  BattleOutcome,
  Loot,
  checkCamp,
  checkOrdersLeft,
  lairBattle,
  lairOutcome,
  payFromLoot,
  paySupplyFromHome,
  redirectSupply,
  splitForRedirect,
  splitSpoils,
  Promotion,
  RaidReport,
  battleNumbers,
  campBattle,
  campOutcome,
  cancelRaid,
  defendRaid,
  dispatchCamp,
  dispatchLair,
  dispatchRaid,
  embark,
  engageDefenders,
  holdField,
  leaveField,
  powerScore,
  raidOutcome,
  receiveRaidReport,
  releaseDefenders,
  returnHome,
  scoutEstimate,
  raidTravelMs,
  takeJoining,
  splitRaid,
} from "@/lib/game/war";
import type { Army } from "@/lib/game/engine";

/** Where an army can be sent: a tribe, one of your barbarian camps, or a bandit lair (its tile). */
/** `rally`: an army sent to a clan strike lands with the others (see rallyLanding). */
type MarchTarget = { target?: number; camp?: number; lair?: Point; rally?: number };

/** Most armies one tribe can have out at once. */


/** Attacks still under way: on the road, or fighting at the target. */
const ACTIVE_ATTACK = "('marching','resolving','fighting')";

const rand = () => crypto.randomInt(0, 1_000_000) / 1_000_000;

export const displayName = (p: { username: string | null; firstName: string }) =>
  p.firstName || (p.username ? `@${p.username}` : "Player");

/** Not in a clan your clan has a treaty with (args: your clan id three times). */
const NOT_TREATY = `(clan_id IS NULL OR clan_id NOT IN (
  SELECT CASE WHEN a = ? THEN b ELSE a END FROM clan_relations WHERE (a = ? OR b = ?) AND kind IN ('ally', 'nap') AND status = 'active'))`;

/** Up to 6 tribes the player can attack right now, near their own strength. */
export async function findTargets(me: Player, now: number, includeId?: number) {
  const db = await getDb();
  const myPower = Math.max(50, powerScore(me.state));
  const ids: number[] = [];
  if (includeId && includeId !== me.id) {
    const r = await db.execute({
      sql: `SELECT id FROM users WHERE id = ? AND shield_until <= ? AND (clan_id IS NULL OR clan_id IS NOT ?) AND ${NOT_TREATY}`,
      args: [includeId, now, me.clanId, me.clanId, me.clanId, me.clanId],
    });
    if (r.rows[0]) ids.push(includeId);
  }
  const rs = await db.execute({
    sql: `SELECT id FROM users
          WHERE id != ? AND shield_until <= ? AND (clan_id IS NULL OR clan_id IS NOT ?) AND ${NOT_TREATY}
          ORDER BY ABS(power - ?) ASC, RANDOM()
          LIMIT 6`,
    args: [me.id, now, me.clanId, me.clanId, me.clanId, me.clanId, myPower],
  });
  for (const row of rs.rows) if (!ids.includes(Number(row.id))) ids.push(Number(row.id));
  const targets = [];
  for (const id of ids.slice(0, 6)) {
    const p = await findById(id);
    if (!p) continue;
    const s = advance(p.state, now);
    targets.push({
      id: p.id,
      name: displayName(p),
      photoUrl: avatarUrl(p.id),
      population: Math.floor(peopleOf(s)),
      power: powerScore(s),
      defense: scoutEstimate(s, me.state),
    });
  }
  return targets;
}

type StoredReport = RaidReport & {
  attackerName: string;
  defenderName: string;
  /** Bandits ambushed the attacker's army on the road (not a battle the attacker chose). */
  ambush?: boolean;
  /** The armies that fought alongside the leading one (the battle's shared report). */
  allies?: { name: string; sent: Army }[];
  /** This army joined someone else's battle: their name (its own share of the battle). */
  allyOf?: string;
};

async function saveReport(
  attackerId: number,
  defenderId: number | null,
  campLevel: number | null,
  report: StoredReport,
  now: number,
  attackId: number | null = null
) {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO battles (attacker_id, defender_id, camp_level, attacker_won, report, created_at, attack_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [attackerId, defenderId, campLevel, report.attackerWon ? 1 : 0, JSON.stringify(report), now, attackId],
  });
}

/**
 * Sends an army across the map to a tribe or one of your barbarian camps.
 * Troops leave now; the battle happens when they arrive (see resolveDueAttacks).
 */
export async function marchTo(me: Player, to: MarchTarget, units: Army, now: number) {
  const db = await getDb();
  const out = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM attacks WHERE attacker_id = ? AND status IN ${ACTIVE_ATTACK}`,
    args: [me.id],
  });

  if (Number(out.rows[0].n) >= MAX_MARCHES) throw new GameError(`You can have ${MAX_MARCHES} armies on the move at once`, "too_many");
  const home = await homeOf(me.id);
  // A clan strike: lands at its time, and counts as committed when the strike was called (see shieldStops).
  const rally = to.rally ? await rallyLanding(me, Math.floor(Number(to.rally)), Math.floor(Number(to.target)), now) : null;
  const landAt = rally?.landAt ?? null;
  const committedAt = rally?.createdAt ?? now;
  const { dest, defenderId, campLevel, lairLevel } = await resolveTarget(me, to, now, home, committedAt);

  // Across the sea the army sails, and takes the Longships it needs along.
  const naval = seaRoute(home, dest, units).naval;
  let sent!: Army;
  let travel = 0;
  const after = await mutatePlayer(me.id, now, (s) => {
    const boarded = embark(s, units, naval);
    const d = campLevel ? dispatchCamp(s, campLevel, boarded, now) : lairLevel ? dispatchLair(s, boarded) : dispatchRaid(s, boarded, now);

    sent = d.sent;
    travel = routeMs(sent, home, dest, getRates(s).marchMultiplier);
    // A player always gets time to react to an attack (camps and lairs don't need it).
    if (defenderId) travel = raidTravelMs(travel);
    // A clan strike: slow down to land with the others (a late army just lands when it can).
    if (landAt) travel = Math.max(travel, landAt - now);

    return d.state;
  });

  try {
    // Bandits along the road may be lying in wait (decided now, sprung when the army passes).
    const ambush = await ambushOnRoad(me, sent, home, dest, now, now + travel);
    const ins = await db.execute({
      sql: `INSERT INTO attacks (attacker_id, defender_id, camp_level, lair_level, units, from_x, from_y, to_x, to_y, sent_at, arrives_at,
                                 ambush, ambush_at, rally_id, committed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        me.id,
        defenderId,
        campLevel,
        lairLevel,
        JSON.stringify(sent),
        home.x,
        home.y,
        dest.x,
        dest.y,
        now,
        now + travel,
        ambush ? JSON.stringify(ambush) : null,
        ambush?.at ?? null,
        landAt ? Math.floor(Number(to.rally)) : null,
        committedAt,
      ],
    });

    if (defenderId) {
      // Warn the defender; with a Watchtower they also see which troops.
      const def = await findById(defenderId);
      const watch = (def?.state.buildings["watchtower"] ?? 0) >= 1;

      await notify.incoming(defenderId, displayName(me), watch ? sent : null, travel, home);
      // The whole clan hears it, and can send guards (see alertClan).
      await alertClan(defenderId, displayName(me), travel, now).catch((e) => console.error("clan alert", e));
    }
    // Anyone with a spy in this village hears the army has gone.
    await spiesSeeMarch(after, sent, travel, now).catch((e) => console.error("spies", e));
    logEvent("war.march", {
      id: Number(ins.lastInsertRowid), defenderId, campLevel, lairLevel, units: sent, travelMs: travel, naval, ambush: !!ambush,
      from: home, to: dest,
    }, { playerId: me.id, at: now });

    return { player: after, march: { id: Number(ins.lastInsertRowid), arrivesAt: now + travel } };
  } catch (e) {
    await mutatePlayer(me.id, now, (s) => cancelRaid(s, sent));
    throw e;
  }
}

/** Whether bandits on the road from `from` to `to` will ambush this army, and how it goes. */
async function ambushOnRoad(me: Player, units: Army, from: Point, to: Point, startedAt: number, endsAt: number) {
  const exposed = await exposureOn(from, to, units, startedAt);

  return rollAmbush(me.state, units, exposed, { startedAt, endsAt }, rand);
}

type Target = { dest: Point; defenderId: number | null; campLevel: number | null; lairLevel: number | null; name: string };

/** Where an attack on a tribe, one of your camps or a bandit lair goes, after checking it's allowed. */
async function resolveTarget(me: Player, to: MarchTarget, now: number, home: Point, committedAt = now): Promise<Target> {
  const db = await getDb();

  if (to.lair) {
    const p = { x: Math.floor(Number(to.lair.x)), y: Math.floor(Number(to.lair.y)) };
    const lair = Number.isFinite(p.x) && Number.isFinite(p.y) ? await lairAt(p, now) : null;

    if (!lair) throw new GameError("There's no bandit lair there");
    if (!lair.active) throw new GameError("This lair is empty. The bandits were driven out.", "lair_empty");
    const busy = await db.execute({
      sql: `SELECT 1 FROM attacks WHERE attacker_id = ? AND lair_level IS NOT NULL AND to_x = ? AND to_y = ? AND status IN ${ACTIVE_ATTACK} LIMIT 1`,
      args: [me.id, p.x, p.y],
    });

    if (busy.rows.length) throw new GameError("An army is already on its way to this lair", "busy");

    return { dest: p, defenderId: null, campLevel: null, lairLevel: lair.level, name: "Bandit lair" };
  }

  if (to.camp) {
    const campLevel = Math.floor(Number(to.camp));
    const dest = (await campSpots(me.id, home, campLevel))[campLevel - 1];

    if (!dest) throw new GameError("Unknown camp");
    const busy = await db.execute({
      sql: `SELECT 1 FROM attacks WHERE attacker_id = ? AND camp_level = ? AND status IN ${ACTIVE_ATTACK} LIMIT 1`,
      args: [me.id, campLevel],
    });

    if (busy.rows.length) throw new GameError("An army is already on its way to this camp", "busy");

    return { dest, defenderId: null, campLevel, lairLevel: null, name: campName(campLevel) };
  }
  const defenderId = Math.floor(Number(to.target));

  if (defenderId === me.id) throw new GameError("You can't attack yourself");
  const target = await findById(defenderId);

  if (!target) throw new GameError("That tribe doesn't exist");
  if (me.clanId != null && target.clanId === me.clanId) throw new GameError("That tribe is in your clan. Clanmates don't raid each other.", "same_clan");
  if (me.clanId != null && target.clanId != null) {
    const r = await relationBetween(me.clanId, target.clanId, now);

    if (blocksRaids(r?.kind)) throw new GameError("Your clan has a treaty with theirs: no raids between you", "treaty");
  }
  // A shield raised after the clan strike was called doesn't stop its armies either.
  if (shieldStops(advance(target.state, now), committedAt, now)) throw new GameError("This tribe is protected by a shield right now", "shielded");

  return { dest: await homeOf(defenderId), defenderId, campLevel: null, lairLevel: null, name: displayName(target) };
}

type AttackRow = {
  id: number;
  attackerId: number;
  defenderId: number | null;
  campLevel: number | null;
  /** Marching on a bandit lair (at `to`) of this level. */
  lairLevel: number | null;
  units: Army;
  from: Point;
  to: Point;
  sentAt: number;
  /** When the army was committed: sent, or its clan strike called. Shields raised later don't stop it. */
  committedAt: number;
  arrivesAt: number;
  endsAt: number | null;
  battle: StoredBattle | null;
  /** This army joined the battle of attack `allyOf` (that row holds the battle). */
  allyOf: number | null;
  /** Spoils carried from an earlier battle of this expedition (after new orders). */
  loot: Loot | null;
  coins: number;
  /** New orders this expedition already took. */
  hops: number;
  /** Set after new orders: the march home from the target takes this long (not the way it came). */
  homeMs: number | null;
  /** Bandits waiting on the road (or who already struck: `done`). */
  ambush: Ambush | null;
};

/** A battle under way: decided when the armies met, played out until plan.endsAt. */
export type StoredBattle = {
  plan: BattlePlan;
  outcome: BattleOutcome;
  /** Defenders on the field (null at a barbarian camp). */
  engaged: Army | null;
  /** Armies of the attackers' side that joined (see joinAlly): each keeps its own row, marked `allyOf`. */
  allies?: Ally[];
};

type Ally = { id: number; attackerId: number; units: Army };

const addArmy = (a: Army, b: Army) => {
  const out = emptyArmy();

  for (const u of UNIT_IDS) out[u] = (a[u] ?? 0) + (b[u] ?? 0);

  return out;
};

/** Every attacker on the field of this battle: the leading army and those that joined it. */
const onField = (a: AttackRow) => (a.battle?.allies ?? []).reduce((t, x) => addArmy(t, x.units), a.units);

const toAttack = (r: Record<string, unknown>): AttackRow => ({
  id: Number(r.id),
  attackerId: Number(r.attacker_id),
  defenderId: r.defender_id == null ? null : Number(r.defender_id),
  campLevel: r.camp_level == null ? null : Number(r.camp_level),
  lairLevel: r.lair_level == null ? null : Number(r.lair_level),
  units: { ...emptyArmy(), ...JSON.parse(String(r.units)) },
  from: { x: Number(r.from_x), y: Number(r.from_y) },
  to: { x: Number(r.to_x), y: Number(r.to_y) },
  sentAt: Number(r.sent_at),
  committedAt: Number(r.committed_at ?? r.sent_at),
  arrivesAt: Number(r.arrives_at),
  endsAt: r.ends_at == null ? null : Number(r.ends_at),
  ...stored(r.battle),
  loot: r.loot == null ? null : (JSON.parse(String(r.loot)) as Loot),
  coins: Number(r.coins ?? 0),
  hops: Number(r.hops ?? 0),
  homeMs: r.home_ms == null ? null : Number(r.home_ms),
  ambush: r.ambush == null ? null : (JSON.parse(String(r.ambush)) as Ambush),
});

/** The battle column: a battle, or (for an army that joined one) which row holds it. */
function stored(raw: unknown): { battle: StoredBattle | null; allyOf: number | null } {
  if (raw == null) return { battle: null, allyOf: null };
  const v = JSON.parse(String(raw)) as StoredBattle | { allyOf: number };

  return "allyOf" in v ? { battle: null, allyOf: Number(v.allyOf) } : { battle: v, allyOf: null };
}

/** Spoils and order count an army keeps on its way home. */
const carriedOf = (a: AttackRow) => ({ loot: a.loot ?? undefined, coins: a.coins, hops: a.hops });

/** How long the march home from the target is. */
const homeTripMs = (a: AttackRow) => a.homeMs ?? a.arrivesAt - a.sentAt;

/** Troop types whose rank went up from one state to the next. */
const promotionsBetween = (before: { troops: Record<string, { xp: number }> }, after: typeof before): Promotion[] =>
  UNIT_IDS.filter((u) => rankForXp(after.troops[u].xp) > rankForXp(before.troops[u].xp)).map((u) => ({
    unit: u,
    rank: rankForXp(after.troops[u].xp),
  }));

/** Nobody to fight: the army turns round and walks home the way it came. */
async function turnBack(a: AttackRow, attackerId: number, name: string | null, now: number, at = a.arrivesAt) {
  logEvent("war.turnback", { id: a.id, defenderId: a.defenderId, campLevel: a.campLevel, lairLevel: a.lairLevel, target: name, at }, { playerId: attackerId, at: now });

  await mutatePlayer(attackerId, now, (s) =>
    returnHome(s, a.units, name ?? "Abandoned land", at + homeTripMs(a), now, rand(), a.to, at, carriedOf(a))
  );
  if (a.lairLevel) await notify.lairEmpty(attackerId).catch(() => {});
  else await notify.turnedBack(attackerId, name ?? "The target");
}

/**
 * A village fights one battle at a time. While it is fighting, its soldiers
 * are out on the field (engageDefenders), so a second army landing then
 * would storm an empty village: send a few troops first to pull the
 * defenders out, and the main army right behind loots everything in a minute.
 * Instead the later army waits at the gates and attacks once the field is
 * clear, against everyone home by then (survivors of the first battle too).
 * Returns null while the village is busy, else when this army's battle starts.
 */
async function fieldClearAt(a: AttackRow): Promise<number | null> {
  if (a.defenderId == null || a.campLevel || a.lairLevel) return a.arrivesAt;
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT
            SUM(CASE WHEN status = 'fighting' THEN 1 ELSE 0 END) AS busy,
            MAX(CASE WHEN status = 'done' THEN ends_at END) AS cleared
          FROM attacks
          WHERE defender_id = ? AND id <> ? AND ends_at IS NOT NULL AND ends_at > ?`,
    args: [a.defenderId, a.id, a.arrivesAt],
  });
  const r = rs.rows[0] as Record<string, unknown> | undefined;

  if (Number(r?.busy ?? 0) > 0) return null;

  return Math.max(a.arrivesAt, Number(r?.cleared ?? 0));
}

/**
 * The armies meet. The fight is decided right away (from both sides as they
 * are now) but lasts a while: defenders leave home for the field, and the
 * result comes out when the last round ends (finishBattle).
 * Returns false when there was no battle and the army went home, "wait" when
 * the village turned out to be fighting another army (it waits at the gates).
 */
async function beginBattle(a: AttackRow, now: number, at = a.arrivesAt): Promise<boolean | "wait"> {
  const db = await getDb();
  const terrain = terrainAt(a.to.x, a.to.y);
  const attacker = await findById(a.attackerId);

  if (!attacker) return false;

  let outcome!: BattleOutcome;
  let engaged: Army | null = null;
  // The two sides, in troops: the battle lasts by the smaller (see battleSize).
  const attackers = troopsOnField(a.units);
  let defenders = 0;
  let villagePlan: BattlePlan | null = null;

  if (a.campLevel) {
    outcome = campOutcome(attacker.state, a.campLevel, a.units, rand(), { terrain });
    defenders = Math.round(campDefense(a.campLevel) / CAMP_DEFENSE_PER_TROOP);
  } else if (a.lairLevel) {
    // Someone else cleared it first: nobody left to fight.
    if (!(await lairManned(a.to, at))) {
      await turnBack(a, attacker.id, "Bandit lair", now);

      return false;
    }
    outcome = lairOutcome(attacker.state, a.lairLevel, a.units, rand(), { terrain });
    defenders = Math.round(banditStrength(a.lairLevel) / CAMP_DEFENSE_PER_TROOP);
  } else {
    const defender = a.defenderId ? await findById(a.defenderId) : null;

    if (!defender) {
      await turnBack(a, attacker.id, null, now);

      return false;
    }
    const landing = seaRoute(a.from, a.to, a.units).naval;

    try {
      await mutatePlayer(defender.id, now, (s) => {
        // Checked again under the tribe's lock: two requests may have let two armies in at once.
        if ((s.defending ?? []).some((f) => f.id !== a.id)) throw new GameError("The village is fighting", "field_busy");
        // A shield raised after this army set out doesn't stop it (see shieldStops).
        if (shieldStops(s, a.committedAt, at)) throw new GameError("This tribe is protected by a shield right now", "shielded");
        const r = raidOutcome(s, attacker.state, a.units, rand(), { terrain, landing });

        outcome = r.outcome;
        engaged = r.defenders;
        // Its soldiers; with none home, the village itself (villagers, Watchtower, walls) counts as only a
        // few, so storming an empty village is over in about 3 rounds (see EMPTY_VILLAGE_DEFENSE_PER_TROOP).
        const soldiers = troopsOnField(r.defenders);

        defenders = soldiers > 0 ? soldiers : Math.round(outcome.defense / EMPTY_VILLAGE_DEFENSE_PER_TROOP);
        villagePlan = planBattle(outcome, at, battleSize(attackers, defenders), rand());

        // Armies of this village coming home during the fight will join it (see joinReinforcements).
        return holdField(engageDefenders(s, r.defenders), a.id, joinDeadline(villagePlan));
      });
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      if (e.code === "field_busy") return "wait";
      await turnBack(a, attacker.id, displayName(defender), now, at); // shielded by the time we got there

      return false;
    }
  }

  const plan = villagePlan ?? planBattle(outcome, at, battleSize(attackers, defenders), rand());
  const battle: StoredBattle = { plan, outcome, engaged };

  try {
    await db.execute({
      sql: "UPDATE attacks SET status = 'fighting', ends_at = ?, battle = ? WHERE id = ?",
      args: [plan.endsAt, JSON.stringify(battle), a.id],
    });
  } catch (e) {
    // The defenders already left home for the field: send them back.
    if (a.defenderId && engaged) await mutatePlayer(a.defenderId, now, (s) => leaveField(s, a.id, engaged)).catch(() => {});
    throw e;
  }
  logEvent("war.begin", {
    id: a.id, defenderId: a.defenderId, campLevel: a.campLevel, lairLevel: a.lairLevel, startsAt: at, endsAt: plan.endsAt,
    waitedMs: at - a.arrivesAt, attackers, defenders, attackerWins: outcome.attackerWon, engaged,
  }, { playerId: attacker.id, at: now });
  if (a.defenderId && plan.endsAt > now) {
    await notify.battleBegun(a.defenderId, displayName(attacker), plan.endsAt - now).catch(() => {});
  }

  return true;
}

/** One "war.finish" event: who won, what each side lost and what was carried off. */
function logFinish(a: AttackRow, attackerId: number, r: RaidReport, now: number) {
  logEvent("war.finish", {
    id: a.id, defenderId: a.defenderId, campLevel: a.campLevel, lairLevel: a.lairLevel, won: r.attackerWon,
    sent: r.sent, attackerLosses: r.attackerLosses, defenderLosses: r.defenderLosses, loot: r.loot, coins: r.coins,
    returnsAt: r.returnsAt, gate: r.gate ?? null, shieldMs: r.shieldMs ?? null, damage: r.damage ?? null, noLoot: r.noLoot ?? null,
  }, { playerId: attackerId, at: now });
}

/** The last round is over: the decided result is applied to both tribes. Times use the battle's end. */
async function finishBattle(a: AttackRow, now: number) {
  const db = await getDb();
  const { plan, outcome, engaged } = a.battle!;
  const at = plan.endsAt;
  const travelMs = homeTripMs(a);
  const carried = { carried: a.loot ?? undefined, carriedCoins: a.coins, hops: a.hops };
  const terrain = terrainAt(a.to.x, a.to.y);
  const landing = seaRoute(a.from, a.to, a.units).naval;
  const story = { battleMs: plan.endsAt - plan.startedAt, rounds: plan.rounds };
  const attacker = await findById(a.attackerId);

  if (!attacker) {
    if (a.defenderId && engaged) await mutatePlayer(a.defenderId, now, (s) => leaveField(s, a.id, engaged));
    await releaseAllies(a, now);

    return;
  }

  if (a.campLevel) {
    let report!: RaidReport;

    await mutatePlayer(attacker.id, now, (s) => {
      const r = campBattle(s, a.campLevel!, a.units, at, rand(), { terrain, travelMs, from: a.to, outcome, ...carried });

      report = r.report;

      return r.state;
    });
    logFinish(a, attacker.id, report, now);
    if (report.attackerWon) await recordForClan(attacker.id, attacker.clanId, "camps", 1, now).catch((e) => console.error("clan week", e));
    const full: StoredReport = { ...report, ...story, attackerName: displayName(attacker), defenderName: campName(a.campLevel) };

    await saveReport(attacker.id, null, a.campLevel, full, at, a.id);
    await notify.attackResult(attacker.id, full.defenderName, report, now);

    return;
  }

  if (a.lairLevel) {
    let report!: RaidReport;

    await mutatePlayer(attacker.id, now, (s) => {
      const r = lairBattle(s, a.lairLevel!, a.units, at, rand(), { terrain, travelMs, from: a.to, outcome, ...carried });

      report = r.report;

      return r.state;
    });
    logFinish(a, attacker.id, report, now);
    if (report.attackerWon) await recordForClan(attacker.id, attacker.clanId, "camps", 1, now).catch((e) => console.error("clan week", e));
    if (report.attackerWon) await clearLair(a.to, attacker.id, at);
    const full: StoredReport = { ...report, ...story, attackerName: displayName(attacker), defenderName: `Bandit lair (level ${a.lairLevel})` };

    await saveReport(attacker.id, null, null, full, at, a.id);
    await notify.attackResult(attacker.id, full.defenderName, report, now);

    return;
  }

  const defender = a.defenderId ? await findById(a.defenderId) : null;

  if (!defender) {
    await turnBack(a, attacker.id, null, now);
    await releaseAllies(a, now);

    return;
  }
  // Armies that joined this one (see joinAlly): they fight as one, then each takes its own share home.
  const allyRows = await allyRowsOf(a);
  const allyPlayers = await Promise.all(allyRows.map((r) => findById(r.attackerId)));
  const sent = onField(a);
  const spoils = [a, ...allyRows].reduce(
    (t, r) => {
      for (const res of RESOURCE_IDS) t.loot[res] += r.loot?.[res] ?? 0;
      t.coins += r.coins;

      return t;
    },
    { loot: { iron: 0, wood: 0, clay: 0, crop: 0 } as Loot, coins: 0 }
  );
  let whole!: RaidReport;

  await mutatePlayer(defender.id, now, (s) => {
    const r = defendRaid(s, attacker.state, sent, at, rand(), {
      terrain,
      travelMs,
      from: a.to,
      landing,
      outcome,
      engaged: engaged ?? undefined,
      carried: allyRows.length ? spoils.loot : carried.carried,
      carriedCoins: allyRows.length ? spoils.coins : carried.carriedCoins,
    });

    whole = r.report;

    return leaveField(r.state, a.id);
  });
  const parts = allyRows.length
    ? splitRaid(whole, [a, ...allyRows].map((r) => ({ sent: r.units, returnsAt: at + homeTripMs(r), carried: r.loot ?? undefined, carriedCoins: r.coins })))
    : [whole];
  const report = parts[0];

  logFinish(a, attacker.id, whole, now);
  // Clans: war points, the weekly goal, and the guards who fought in the village.
  await scoreWar(attacker.clanId, defender.clanId, report.attackerWon, now).catch((e) => console.error("war score", e));
  if (report.attackerWon) await recordForClan(attacker.id, attacker.clanId, "wins", 1, now).catch((e) => console.error("clan week", e));
  else await recordForClan(defender.id, defender.clanId, "wins", 1, now).catch((e) => console.error("clan week", e));
  await reconcileSupport(now, defender.id).catch((e) => console.error("guards after battle", e));
  // The battle's own report (the defender's too) is the whole battle; the leader's march home is its share.
  const full: StoredReport = {
    ...whole,
    ...story,
    attackerName: displayName(attacker),
    defenderName: displayName(defender),
    ...(allyRows.length
      ? { allies: allyRows.map((r, i) => ({ name: allyPlayers[i] ? displayName(allyPlayers[i]!) : "A tribe", sent: r.units })) }
      : {}),
  };
  let promoted: Promotion[] = [];

  await mutatePlayer(attacker.id, now, (s) => {
    const next = receiveRaidReport(s, report, full.defenderName, at, rand(), a.to, a.hops);

    promoted = promotionsBetween(s, next);

    return next;
  });
  full.attackerPromoted = promoted;
  await saveReport(attacker.id, defender.id, null, full, at, a.id);
  // Each army that joined: its share home, and its own report.
  for (const [i, r] of allyRows.entries()) {
    const p = allyPlayers[i];

    if (p) {
      const mine: StoredReport = { ...parts[i + 1], ...story, attackerName: displayName(p), defenderName: full.defenderName, allyOf: full.attackerName };
      let up: Promotion[] = [];

      await mutatePlayer(p.id, now, (s) => {
        const next = receiveRaidReport(s, parts[i + 1], full.defenderName, at, rand(), a.to, r.hops);

        up = promotionsBetween(s, next);

        return next;
      });
      mine.attackerPromoted = up;
      await saveReport(p.id, defender.id, null, mine, at, r.id);
      await notify.attackResult(p.id, full.defenderName, mine, now).catch(() => {});
    }
    await db.execute({ sql: "UPDATE attacks SET status = 'done' WHERE id = ?", args: [r.id] });
  }
  await Promise.all([
    notify.attackResult(attacker.id, full.defenderName, full, now),
    whole.attackerWon
      ? notify.raided(defender.id, full.attackerName, whole, attacker.id)
      : notify.defended(defender.id, full.attackerName, whole),
  ]);
}

/** The rows of the armies that joined battle `a`. */
async function allyRowsOf(a: AttackRow): Promise<AttackRow[]> {
  const ids = (a.battle?.allies ?? []).map((x) => x.id);

  if (!ids.length) return [];
  const db = await getDb();
  const rs = await db.execute({ sql: `SELECT * FROM attacks WHERE id IN (${ids.map(() => "?").join(",")})`, args: ids });

  return rs.rows.map((r) => toAttack(r as Record<string, unknown>));
}

/** The battle couldn't be fought: the armies that joined it go home with what they carried, nothing lost. */
async function releaseAllies(a: AttackRow, now: number) {
  const db = await getDb();

  for (const r of await allyRowsOf(a)) {
    await mutatePlayer(r.attackerId, now, (s) =>
      returnHome(s, r.units, "a battle that didn't happen", now + homeTripMs(r), now, rand(), r.to, now, carriedOf(r))
    ).catch((e) => console.error("ally home", r.id, e));
    await db.execute({ sql: "UPDATE attacks SET status = 'done' WHERE id = ?", args: [r.id] });
  }
}

/** Something went wrong: everyone goes home with nothing, so no troops are lost to a bug. */
async function abandon(a: AttackRow, now: number, e: unknown) {
  console.error("battle failed, sending the armies home", a.id, e);
  logEvent("war.abandon", { id: a.id, defenderId: a.defenderId, battle: !!a.battle, ...errorData(e) }, { playerId: a.attackerId, at: now, level: "error" });
  await mutatePlayer(a.attackerId, now, (s) =>
    returnHome(s, a.units, "a failed march", now + 60_000, now, rand(), undefined, now, carriedOf(a))
  ).catch(() => {});
  if (a.defenderId && a.battle?.engaged) {
    await mutatePlayer(a.defenderId, now, (s) => leaveField(s, a.id, a.battle!.engaged)).catch(() => {});
  }
  await releaseAllies(a, now).catch(() => {});
}

/**
 * Starts the battles whose armies have arrived and finishes the ones whose
 * last round is over. Called at the start of war requests, at sign-in and by
 * the cron, so results appear the next time anyone looks. With `playerId`,
 * only battles that player is attacking or defending in.
 */
export async function resolveDueAttacks(now: number, playerId?: number) {
  const db = await getDb();
  const mine = playerId == null ? "" : " AND (attacker_id = ? OR defender_id = ?)";
  const who = playerId == null ? [] : [playerId, playerId];

  // Bandits strike first: an ambush always comes before the army arrives.
  await springAmbushes(now, playerId);
  const arrived = await db.execute({
    sql: `SELECT * FROM attacks WHERE status = 'marching' AND arrives_at <= ?${mine} ORDER BY arrives_at ASC LIMIT 20`,
    args: [now, ...who],
  });

  for (const row of arrived.rows) {
    const a = toAttack(row as Record<string, unknown>);
    // The village is still fighting an earlier army: wait at the gates (see fieldClearAt).
    const at = await fieldClearAt(a);

    // Busy fighting your own army or a clanmate's: join that battle instead of waiting.
    if (at == null) {
      await withEventContext(`battle:join #${a.id}`, () => joinAlly(a, now)).catch((e) => console.error("joinAlly", a.id, e));
      continue;
    }
    const claim = await db.execute({
      sql: "UPDATE attacks SET status = 'resolving' WHERE id = ? AND status = 'marching'",
      args: [a.id],
    });

    if (claim.rowsAffected !== 1) continue; // another request took it
    let fighting: boolean | "wait" = false;

    try {
      fighting = await withEventContext(`battle:begin #${a.id}`, () => beginBattle(a, now, at));
    } catch (e) {
      await withEventContext(`battle:abandon #${a.id}`, () => abandon(a, now, e));
    }
    if (fighting === "wait") {
      await db.execute({ sql: "UPDATE attacks SET status = 'marching' WHERE id = ? AND status = 'resolving'", args: [a.id] });
      continue;
    }
    if (!fighting) await db.execute({ sql: "UPDATE attacks SET status = 'done' WHERE id = ?", args: [a.id] });
  }

  // Armies that came home into a battle join it before anything is finished.
  await joinReinforcements(now, playerId);

  const ended = await db.execute({
    // Armies that joined another's battle (allyOf) are finished with it, by the leading army's row.
    sql: `SELECT * FROM attacks WHERE status = 'fighting' AND ends_at <= ?${mine}
            AND (battle IS NULL OR json_extract(battle, '$.allyOf') IS NULL) ORDER BY ends_at ASC LIMIT 20`,
    args: [now, ...who],
  });

  for (const row of ended.rows) {
    const a = toAttack(row as Record<string, unknown>);
    const claim = await db.execute({
      sql: "UPDATE attacks SET status = 'resolving' WHERE id = ? AND status = 'fighting'",
      args: [a.id],
    });

    if (claim.rowsAffected !== 1) continue;
    try {
      await withEventContext(`battle:finish #${a.id}`, () => finishBattle(a, now));
    } catch (e) {
      await withEventContext(`battle:abandon #${a.id}`, () => abandon(a, now, e));
    }
    await db.execute({ sql: "UPDATE attacks SET status = 'done' WHERE id = ?", args: [a.id] });
  }
}

/** The armies that joined battle `hostId` end when it does. */
const syncAllies = (hostId: number, endsAt: number) => ({
  sql: "UPDATE attacks SET ends_at = ? WHERE status = 'fighting' AND json_extract(battle, '$.allyOf') = ?",
  args: [endsAt, hostId],
});

/**
 * An army reached a village that is fighting another army of its side: the
 * same tribe's, or a clanmate's. Rather than wait at the gates for its own
 * battle (see fieldClearAt), it joins that one at the next round, and the
 * rest of the battle is decided again with it (reinforceAttack). Too late to
 * join (the last round has begun): it keeps waiting, as before.
 * Returns whether it joined.
 */
async function joinAlly(a: AttackRow, now: number): Promise<boolean> {
  if (a.defenderId == null || a.campLevel || a.lairLevel) return false;
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT h.* FROM attacks h
            JOIN users hu ON hu.id = h.attacker_id
            JOIN users au ON au.id = ?
          WHERE h.defender_id = ? AND h.id <> ? AND h.status = 'fighting' AND h.battle IS NOT NULL
            AND json_extract(h.battle, '$.allyOf') IS NULL
            AND (h.attacker_id = au.id OR (au.clan_id IS NOT NULL AND hu.clan_id = au.clan_id))
          ORDER BY h.ends_at ASC LIMIT 1`,
    args: [a.attackerId, a.defenderId, a.id],
  });
  const row = rs.rows[0];

  if (!row) return false;
  const h = toAttack(row as Record<string, unknown>);
  const [defender, leader] = await Promise.all([findById(a.defenderId), findById(h.attackerId)]);

  if (!defender || !leader || !h.battle) return false;
  const mine = await db.execute({ sql: "UPDATE attacks SET status = 'resolving' WHERE id = ? AND status = 'marching'", args: [a.id] });

  if (mine.rowsAffected !== 1) return false; // another request took it
  const theirs = await db.execute({ sql: "UPDATE attacks SET status = 'resolving' WHERE id = ? AND status = 'fighting'", args: [h.id] });
  let joined = false;

  try {
    if (theirs.rowsAffected !== 1) return false;
    const next = reinforceAttack(defender.state, leader.state, onField(h), h.battle, { at: a.arrivesAt, units: a.units }, rand(), {
      terrain: terrainAt(h.to.x, h.to.y),
      landing: seaRoute(h.from, h.to, h.units).naval,
    });

    if (!next) return false;
    const battle: StoredBattle = {
      ...h.battle,
      ...next,
      allies: [...(h.battle.allies ?? []), { id: a.id, attackerId: a.attackerId, units: a.units }],
    };

    // Returning defenders can join until the new last round.
    await mutatePlayer(defender.id, now, (s) => holdField(s, h.id, joinDeadline(battle.plan)));
    await db.batch(
      [
        { sql: "UPDATE attacks SET status = 'fighting', ends_at = ?, battle = ? WHERE id = ?", args: [battle.plan.endsAt, JSON.stringify(battle), h.id] },
        { sql: "UPDATE attacks SET status = 'fighting', ends_at = ?, battle = ? WHERE id = ?", args: [battle.plan.endsAt, JSON.stringify({ allyOf: h.id }), a.id] },
        syncAllies(h.id, battle.plan.endsAt),
      ],
      "write"
    );
    joined = true;
    logEvent("war.ally", { id: a.id, joined: h.id, defenderId: a.defenderId, units: a.units, endsAt: battle.plan.endsAt, attackerWins: battle.outcome.attackerWon }, { playerId: a.attackerId, at: now });
  } finally {
    if (!joined) {
      await db.batch(
        [
          { sql: "UPDATE attacks SET status = 'marching' WHERE id = ? AND status = 'resolving'", args: [a.id] },
          ...(theirs.rowsAffected === 1 ? [{ sql: "UPDATE attacks SET status = 'fighting' WHERE id = ? AND status = 'resolving'", args: [h.id] }] : []),
        ],
        "write"
      );
    }
  }

  return joined;
}

/**
 * Puts on the field the defenders' armies that came home while their village
 * was fighting (the engine holds them in `joining`, see returnMarch). The rest
 * of each battle is decided again with them; rounds already fought stay.
 */
async function joinReinforcements(now: number, playerId?: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT * FROM attacks WHERE status = 'fighting' AND defender_id IS NOT NULL${
      playerId == null ? "" : " AND (attacker_id = ? OR defender_id = ?)"
    } ORDER BY ends_at ASC LIMIT 20`,
    args: playerId == null ? [] : [playerId, playerId],
  });

  for (const row of rs.rows) {
    const a = toAttack(row as Record<string, unknown>);
    const defender = a.defenderId ? await findById(a.defenderId) : null;

    if (!defender || !a.battle) continue;
    // Cheap look first: most battles have nobody coming home.
    if (!(advance(defender.state, now).joining ?? []).some((j) => j.id === a.id)) continue;
    const attacker = await findById(a.attackerId);

    if (!attacker) continue; // finishBattle sends everyone home
    const claim = await db.execute({
      sql: "UPDATE attacks SET status = 'resolving' WHERE id = ? AND status = 'fighting'",
      args: [a.id],
    });

    if (claim.rowsAffected !== 1) continue;
    const terrain = terrainAt(a.to.x, a.to.y);
    const landing = seaRoute(a.from, a.to, a.units).naval;
    let battle: StoredBattle = a.battle;
    let joined = emptyArmy();
    let saved = false;

    try {
      await mutatePlayer(defender.id, now, (s0) => {
        const { state: s, joins } = takeJoining(s0, a.id);

        battle = a.battle!;
        joined = emptyArmy();
        for (const j of joins) {
          const next = reinforceBattle(s, attacker.state, onField({ ...a, battle }), battle, j, rand(), { terrain, landing });

          if (next) {
            battle = { ...battle, ...next };
            for (const u of UNIT_IDS) joined[u] += j.units[u] ?? 0;
          } else {
            // Too late to join: they wait at home for the result.
            for (const u of UNIT_IDS) s.army[u] += j.units[u] ?? 0;
          }
        }

        return holdField(s, a.id, joinDeadline(battle.plan));
      });
      try {
        await db.batch(
          [
            { sql: "UPDATE attacks SET status = 'fighting', ends_at = ?, battle = ? WHERE id = ?", args: [battle.plan.endsAt, JSON.stringify(battle), a.id] },
            syncAllies(a.id, battle.plan.endsAt),
          ],
          "write"
        );
        saved = true;
      } catch (e) {
        // The battle couldn't take them: the newcomers go home rather than vanish.
        console.error("reinforcements failed, sending them home", a.id, e);
        await mutatePlayer(defender.id, now, (s) => releaseDefenders(s, joined)).catch(() => {});
      }
    } finally {
      if (!saved) {
        await db.execute({ sql: "UPDATE attacks SET status = 'fighting' WHERE id = ? AND status = 'resolving'", args: [a.id] });
      }
    }
    if (saved && troopsOnField(joined) > 0) {
      await notify.reinforced(defender.id, displayName(attacker), joined).catch(() => {});
    }
  }
}

/**
 * Springs the ambushes whose armies are passing the bandits' lair by now:
 * the dead leave the army, and bandits who won take half the spoils it
 * carries. If the lair was cleared before the army got there, nothing happens.
 */
async function springAmbushes(now: number, playerId?: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT a.*, du.first_name AS d_name FROM attacks a LEFT JOIN users du ON du.id = a.defender_id
          WHERE a.status = 'marching' AND a.ambush_at IS NOT NULL AND a.ambush_at <= ?${playerId == null ? "" : " AND a.attacker_id = ?"}
          ORDER BY a.ambush_at ASC LIMIT 20`,
    args: playerId == null ? [now] : [now, playerId],
  });

  for (const row of rs.rows) {
    const a = toAttack(row as Record<string, unknown>);
    const amb = a.ambush;

    if (!amb) continue;
    const manned = await lairManned(amb, amb.at);
    let units = a.units;
    let loot = a.loot;
    let coins = a.coins;
    let done: Ambush;

    if (!manned) {
      done = { ...amb, done: true, foiled: true };
    } else {
      const sp = spoilsTaken(amb, loot, coins);

      units = afterAmbush(units, amb);
      loot = a.loot ? ({ ...a.loot, ...sp.left } as typeof a.loot) : null;
      coins = sp.coinsLeft;
      done = { ...amb, done: true, loot: sp.taken, coins: sp.coinsTaken };
    }
    // Only if nobody else sprang it (or recalled the army) meanwhile.
    const claim = await db.execute({
      sql: `UPDATE attacks SET units = ?, loot = ?, coins = ?, ambush = ?, ambush_at = NULL
            WHERE id = ? AND status = 'marching' AND ambush_at IS NOT NULL`,
      args: [JSON.stringify(units), loot ? JSON.stringify(loot) : null, coins, JSON.stringify(done), a.id],
    });

    if (claim.rowsAffected !== 1 || done.foiled) continue;
    const target = a.campLevel
      ? campName(a.campLevel)
      : a.lairLevel
        ? "the bandit lair"
        : String((row as Record<string, unknown>).d_name || "a tribe");

    await notify.ambushed(a.attackerId, target, done).catch(() => {});
    const attacker = await findById(a.attackerId);
    const none = emptyArmy();

    await saveReport(
      a.attackerId,
      null,
      null,
      {
        attackerWon: done.won,
        attack: done.attack,
        defense: done.strength,
        luck: done.luck ?? 1,
        attackerLosses: done.lost,
        attackerHealed: none,
        defenderLosses: none,
        defenderHealed: none,
        sent: a.units,
        defenders: none,
        loot: { iron: 0, wood: 0, clay: 0, crop: 0 },
        coins: 0,
        returnsAt: a.arrivesAt,
        ...(done.coins || RESOURCE_IDS.some((r) => (done.loot?.[r] ?? 0) > 0)
          ? { carried: { iron: 0, wood: 0, clay: 0, crop: 0, ...done.loot }, carriedCoins: done.coins ?? 0 }
          : {}),
        attackerName: attacker ? displayName(attacker) : "Your army",
        defenderName: `Bandits (level ${done.level})`,
        ambush: true,
      },
      done.at,
      a.id
    ).catch(() => {});
  }
}

/** Calls an army back before it arrives. It walks home the way it came. */
export async function recallMarch(me: Player, id: number, now: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT * FROM attacks WHERE id = ? AND attacker_id = ? AND status = 'marching' AND arrives_at > ?",
    args: [id, me.id, now],
  });

  if (!rs.rows[0]) throw new GameError("That army can't be recalled anymore", "not_found");
  const a = toAttack(rs.rows[0] as Record<string, unknown>);
  const claim = await db.execute({
    sql: "UPDATE attacks SET status = 'recalled' WHERE id = ? AND status = 'marching'",
    args: [id],
  });

  if (claim.rowsAffected !== 1) throw new GameError("That army can't be recalled anymore", "not_found");
  const walked = now - a.sentAt;
  const where = spotOnRoad(a.from, a.to, a.units, walked / Math.max(1, a.arrivesAt - a.sentAt)).tile;
  // An army that took new orders started this leg out on the map: it goes
  // home from where it is now, not back the way it came.
  const back = a.homeMs == null ? walked : routeMs(a.units, where, await homeOf(me.id), getRates(me.state).marchMultiplier);

  return mutatePlayer(me.id, now, (s) => returnHome(s, a.units, "recalled", now + back, now, rand(), where, now, carriedOf(a)));
}

/** Where an army is along its road, `f` of the way through in time: on a whole tile, and whether it's at sea. */
function spotOnRoad(from: Point, to: Point, units: Army, f: number) {
  const road = routeFor(units, from, to);
  const spot = pointAlong(road, routeTimeline(road, units), Math.min(1, Math.max(0, f)));
  const tile = { x: Math.round(spot.x), y: Math.round(spot.y) };

  return { tile, atSea: spot.atSea || terrainAt(tile.x, tile.y) === "sea" };
}

/** Where an expedition given new orders is, and what it has with it. */
type Expedition = {
  units: Army;
  where: Point;
  loot: Loot | null;
  coins: number;
  hops: number;
  /** The attack row it's marching under (null: an army on its way home). */
  attack: AttackRow | null;
  /** The march in the player's state (an army on its way home). */
  marchId: string | null;
};

/**
 * Gives an army out on the map new orders: from where it stands it marches on
 * another tribe or camp. Works on an army marching to its target (before it
 * arrives) and on one walking home with the spoils. It can leave troops
 * behind, who walk home with their share of the spoils, but never take more.
 * Supplies for the new road come out of the spoils first, then home storage.
 * Each expedition takes a limited number of new orders (War Orders card).
 */
export async function redirectMarch(
  me: Player,
  from: { attack?: number; march?: string },
  to: MarchTarget,
  keep: Army,
  now: number
) {
  const db = await getDb();
  const home = await homeOf(me.id);
  const mult = getRates(me.state).marchMultiplier;
  let ex: Expedition;

  if (from.attack != null) {
    const rs = await db.execute({
      sql: "SELECT * FROM attacks WHERE id = ? AND attacker_id = ? AND status = 'marching' AND arrives_at > ?",
      args: [Math.floor(Number(from.attack)), me.id, now],
    });

    if (!rs.rows[0]) throw new GameError("That army can't take new orders anymore", "not_found");
    const a = toAttack(rs.rows[0] as Record<string, unknown>);
    const pos = spotOnRoad(a.from, a.to, a.units, (now - a.sentAt) / Math.max(1, a.arrivesAt - a.sentAt));

    if (pos.atSea) throw new GameError("The army is out at sea. Give new orders once it's back on land.", "at_sea");
    ex = { units: a.units, where: pos.tile, loot: a.loot, coins: a.coins, hops: a.hops, attack: a, marchId: null };
  } else {
    const m = me.state.marches.find((x) => x.id === String(from.march) && x.returnsAt > now);

    if (!m) throw new GameError("That army is already home", "not_found");
    if (!m.from) throw new GameError("This army's road isn't known. It has to come home first.", "not_found");
    const leftAt = m.leftAt ?? m.returnsAt - routeMs(m.units, m.from, home, mult);
    const pos = spotOnRoad(m.from, home, m.units, (now - leftAt) / Math.max(1, m.returnsAt - leftAt));

    if (pos.atSea) throw new GameError("The army is out at sea. Give new orders once it's back on land.", "at_sea");
    const out = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM attacks WHERE attacker_id = ? AND status IN ${ACTIVE_ATTACK}`,
      args: [me.id],
    });

    if (Number(out.rows[0].n) >= MAX_MARCHES) throw new GameError(`You can have ${MAX_MARCHES} armies on the move at once`, "too_many");
    ex = { units: m.units, where: pos.tile, loot: m.loot, coins: m.coins, hops: m.hops ?? 0, attack: null, marchId: m.id };
  }

  checkOrdersLeft(me.state, ex.hops);
  if (to.camp) checkCamp(me.state, Math.floor(Number(to.camp)), now);
  const t = await resolveTarget(me, to, now, home);
  const cur = ex.attack;

  if (
    cur &&
    cur.defenderId === t.defenderId &&
    cur.campLevel === t.campLevel &&
    cur.lairLevel === t.lairLevel &&
    (!t.lairLevel || (cur.to.x === t.dest.x && cur.to.y === t.dest.y))
  ) {
    throw new GameError("The army is already marching there", "same_target");
  }

  // Ships go with whoever's road crosses the sea.
  const { go, back } = splitForRedirect(ex.units, keep, {
    go: seaRoute(ex.where, t.dest).naval || seaRoute(t.dest, home).naval,
    back: seaRoute(ex.where, home).naval,
  });
  // A player being attacked always gets time to react, redirected army or not.
  const legMs = t.defenderId ? raidTravelMs(routeMs(go, ex.where, t.dest, mult)) : routeMs(go, ex.where, t.dest, mult);
  const homeMs = routeMs(go, t.dest, home, mult);
  const backMs = routeMs(back, ex.where, home, mult);
  const share = splitSpoils(ex.loot ?? {}, ex.coins, go, back);
  const supply = redirectSupply(go, legMs);
  const paid = payFromLoot(share.go, supply);

  // Take the army off its old road before anything else can use it.
  if (cur) {
    const claim = await db.execute({
      sql: "UPDATE attacks SET status = 'redirected' WHERE id = ? AND status = 'marching'",
      args: [cur.id],
    });

    if (claim.rowsAffected !== 1) throw new GameError("That army can't take new orders anymore", "not_found");
  }
  let after: Player;

  try {
    after = await mutatePlayer(me.id, now, (s0) => {
      let s = s0;

      if (ex.marchId) {
        if (!s.marches.some((m) => m.id === ex.marchId && m.returnsAt > now)) throw new GameError("That army is already home", "not_found");
        s = { ...s, marches: s.marches.filter((m) => m.id !== ex.marchId) };
      }
      s = paySupplyFromHome(s, paid.owed);

      // Whoever stays behind walks home with their share of the spoils.
      return returnHome(s, back, "the road", now + backMs, now, rand(), ex.where, now, {
        loot: share.back,
        coins: share.backCoins,
        hops: ex.hops,
      });
    });
  } catch (e) {
    if (cur) await db.execute({ sql: "UPDATE attacks SET status = 'marching' WHERE id = ? AND status = 'redirected'", args: [cur.id] });
    throw e;
  }

  let id: number;

  try {
    const ambush = await ambushOnRoad(me, go, ex.where, t.dest, now, now + legMs);
    const ins = await db.execute({
      sql: `INSERT INTO attacks (attacker_id, defender_id, camp_level, lair_level, units, from_x, from_y, to_x, to_y, sent_at, arrives_at,
                                 loot, coins, hops, home_ms, parent_id, ambush, ambush_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        me.id,
        t.defenderId,
        t.campLevel,
        t.lairLevel,
        JSON.stringify(go),
        ex.where.x,
        ex.where.y,
        t.dest.x,
        t.dest.y,
        now,
        now + legMs,
        JSON.stringify(paid.loot),
        share.goCoins,
        ex.hops + 1,
        homeMs,
        cur?.id ?? null,
        ambush ? JSON.stringify(ambush) : null,
        ambush?.at ?? null,
      ],
    });

    id = Number(ins.lastInsertRowid);
  } catch (e) {
    // Couldn't set off: they walk home with what they carry, so nothing is lost.
    await mutatePlayer(me.id, now, (s) =>
      returnHome(s, go, "a failed march", now + routeMs(go, ex.where, home, mult), now, rand(), ex.where, now, {
        loot: paid.loot,
        coins: share.goCoins,
        hops: ex.hops,
      })
    ).catch(() => {});
    throw e;
  }

  // The old target sees the army turn away; the new one sees it coming.
  if (cur?.defenderId) await notify.calledOff(cur.defenderId, displayName(me)).catch(() => {});
  if (t.defenderId) {
    const def = await findById(t.defenderId);
    const watch = (def?.state.buildings["watchtower"] ?? 0) >= 1;

    await notify.incoming(t.defenderId, displayName(me), watch ? go : null, legMs).catch(() => {});
  }

  return { player: after, march: { id, arrivesAt: now + legMs, supply, fromHome: paid.owed } };
}

/** Pays scouts to look inside a tribe: exact defense, troops home and what could be looted. */
export async function scoutTribe(me: Player, targetId: number, now: number) {
  if (!getRates(me.state).canScout) throw new GameError("Build an Exploration Center to send scouts", "locked");
  if (targetId === me.id) throw new GameError("That's your own tribe");
  const target = await findById(targetId);

  if (!target) throw new GameError("That tribe doesn't exist");
  const [home, there] = await Promise.all([homeOf(me.id), homeOf(targetId)]);
  const cost = scoutCost(distance(home, there));
  const after = await mutatePlayer(me.id, now, (s) => {
    if (s.coins < cost) throw new GameError(`Scouting costs ${cost} coins`, "not_enough_coins");
    s.coins -= cost;

    return s;
  });
  const t = advance(target.state, now);
  const terrain = terrainAt(there.x, there.y);
  const hidden = getRates(t).hidden;
  const loot = Object.fromEntries(RESOURCE_IDS.map((r) => [r, Math.floor(Math.max(0, t.resources[r] - hidden) * MAX_LOOT_SHARE)]));
  const troops = Object.fromEntries(UNIT_IDS.map((u) => [u, t.army[u]]));

  return {
    player: after,
    scout: {
      id: target.id,
      name: displayName(target),
      at: now,
      cost,
      terrain,
      defense: Math.round(battleNumbers(me.state, emptyArmy(), t, terrain).defense),
      troops,
      loot,
      shieldUntil: t.shieldUntil,
      power: powerScore(t),
    },
  };
}

export async function listReports(me: Player) {
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT id, attacker_id, defender_id, camp_level, attacker_won, report, created_at, attack_id FROM battles
          WHERE attacker_id = ? OR (defender_id = ? AND json_extract(report, '$.allyOf') IS NULL)
          ORDER BY created_at DESC LIMIT 30`,
    args: [me.id, me.id],
  });
  // Where each opponent's village is, so a report can show it and jump there on the map.
  const others = [
    ...new Set(rs.rows.flatMap((r) => [r.attacker_id, r.defender_id]).filter((id) => id != null && Number(id) !== me.id).map(Number)),
  ];
  const homes = new Map<number, { x: number; y: number }>();

  if (others.length) {
    const hs = await db.execute({
      sql: `SELECT id, map_x, map_y FROM users WHERE map_x IS NOT NULL AND id IN (${others.map(() => "?").join(",")})`,
      args: others,
    });

    for (const h of hs.rows) homes.set(Number(h.id), { x: Number(h.map_x), y: Number(h.map_y) });
  }

  return rs.rows.map((r) => {
    const report = JSON.parse(String(r.report)) as StoredReport;
    const asAttacker = Number(r.attacker_id) === me.id;
    const oppId = asAttacker ? (r.defender_id == null ? null : Number(r.defender_id)) : Number(r.attacker_id);
    return {
      /** The opponent's village on the map (null for camps and bandits). */
      opponentAt: oppId != null ? (homes.get(oppId) ?? null) : null,
      id: Number(r.id),
      at: Number(r.created_at),
      role: asAttacker ? ("attacker" as const) : ("defender" as const),
      won: asAttacker ? report.attackerWon : !report.attackerWon,
      opponent: asAttacker ? report.defenderName : report.attackerName,
      opponentId: asAttacker ? (r.defender_id == null ? null : Number(r.defender_id)) : Number(r.attacker_id),
      campLevel: r.camp_level == null ? null : Number(r.camp_level),
      attackId: r.attack_id == null ? null : Number(r.attack_id),
      report,
    };
  });
}

export type LeaderboardMetric = "population" | "power" | "wins";

/** Players listed from the top. */
const LEADERBOARD_TOP = 50;
/** Below the top: this many players just above you, and just below. */
const AROUND_ABOVE = 3;
const AROUND_BELOW = 2;

export async function leaderboard(me: Player, metric: LeaderboardMetric) {
  const col = metric === "power" ? "power" : metric === "wins" ? "wins" : "population";
  // Places are kept in columns (see ranks.ts): the list and "your rank" come
  // straight from them, instead of counting or skipping past everyone ahead.
  const rk = metric === "power" ? "power_rank" : metric === "wins" ? "wins_rank" : "pop_rank";
  const cols = "id, username, first_name, photo_url, population, power, wins, plus_until";
  const db = await getDb();

  // Someone is looking: rank now if the last pass is over a minute old.
  await maybeRefreshRanks().catch((e) => console.error("maybeRefreshRanks", e));
  const [top, mine] = await db.batch(
    [
      `SELECT ${cols}, ${rk} AS rk FROM users WHERE ${rk} <= ${LEADERBOARD_TOP} ORDER BY ${rk} ASC`,
      { sql: `SELECT ${col} AS v, ${rk} AS rk FROM users WHERE id = ?`, args: [me.id] },
    ],
    "read"
  );
  const myValue = Number(mine.rows[0]?.v ?? 0);
  // Not ranked yet (joined in the last minute): count, ties by id as in the list.
  const myRank =
    mine.rows[0]?.rk != null
      ? Number(mine.rows[0].rk)
      : Number(
          (
            await db.execute({
              sql: `SELECT COUNT(*) + 1 AS r FROM users WHERE ${col} > ? OR (${col} = ? AND id < ?)`,
              args: [myValue, myValue, me.id],
            })
          ).rows[0].r
        );
  // Out of the top: show who's just ahead (the next to beat) and just behind.
  const from = Math.max(LEADERBOARD_TOP, myRank - 1 - AROUND_ABOVE);
  const around =
    myRank > LEADERBOARD_TOP
      ? await db.execute({
          sql: `SELECT ${cols}, ${rk} AS rk FROM users WHERE ${rk} > ? AND ${rk} <= ? ORDER BY ${rk} ASC`,
          args: [from, myRank + AROUND_BELOW],
        })
      : null;
  const now = Date.now();
  const row = (r: (typeof top.rows)[number], rank: number) => ({
    rank,
    id: Number(r.id),
    name: String(r.first_name || (r.username ? `@${r.username}` : "Player")),
    photoUrl: avatarUrl(Number(r.id)),
    value: Math.floor(Number(r[col])),
    isMe: Number(r.id) === me.id,
    plus: Number(r.plus_until ?? 0) > now,
  });

  // The ranks are up to a minute old but the values are live: a tribe that just
  // trained an army showed 195k power at #9 under four tribes with less. Within
  // each shown list, order by the value shown and number from the list's first place.
  const ordered = (rows: typeof top.rows) => {
    const first = rows.reduce((m, r) => Math.min(m, Number(r.rk)), Infinity);
    const sorted = [...rows].sort((a, b) => Number(b[col]) - Number(a[col]) || Number(a.id) - Number(b.id));

    return sorted.map((r, i) => row(r, first + i));
  };
  const list = ordered(top.rows);
  const near = around ? ordered(around.rows) : [];
  const shown = [...list, ...near].find((r) => r.isMe);

  return {
    metric,
    me: { rank: shown?.rank ?? myRank, value: Math.floor(myValue) },
    top: list,
    around: near,
  };
}

