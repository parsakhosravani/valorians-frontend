import "server-only";

import crypto from "crypto";

import { getDb } from "./db";
import { campSpots, homeOf } from "./map";
import { notify } from "./notify";
import { Player, avatarUrl, findById, mutatePlayer } from "./players";

import { GameError, advance, emptyArmy, getRates, rankForXp } from "@/lib/game/engine";
import { CAMP_DEFENSE_PER_TROOP, MAX_LOOT_SHARE, RESOURCE_IDS, UNIT_IDS, campDefense } from "@/lib/game/config";
import { BattlePlan, planBattle, troopsOnField } from "@/lib/game/battle";
import { Point, distance, marchRoute, pointAlong, routeMs, routeTimeline, scoutCost, seaRoute, terrainAt } from "@/lib/game/map";
import {
  BattleOutcome,
  Loot,
  checkCamp,
  checkOrdersLeft,
  payFromLoot,
  paySupplyFromHome,
  redirectSupply,
  splitForRedirect,
  splitSpoils,
  Promotion,
  RaidReport,
  armySize,
  battleNumbers,
  campBattle,
  campOutcome,
  cancelRaid,
  defendRaid,
  dispatchCamp,
  dispatchRaid,
  embark,
  engageDefenders,
  powerScore,
  raidOutcome,
  receiveRaidReport,
  releaseDefenders,
  returnHome,
  scoutEstimate,
} from "@/lib/game/war";
import type { Army } from "@/lib/game/engine";

/** Most armies one tribe can have out at once. */
const MAX_MARCHES = 5;

/** Attacks still under way: on the road, or fighting at the target. */
export const ACTIVE_ATTACK = "('marching','resolving','fighting')";

const rand = () => crypto.randomInt(0, 1_000_000) / 1_000_000;

export const displayName = (p: { username: string | null; firstName: string }) =>
  p.firstName || (p.username ? `@${p.username}` : "Player");

/** Up to 6 tribes the player can attack right now, near their own strength. */
export async function findTargets(me: Player, now: number, includeId?: number) {
  const db = await getDb();
  const myPower = Math.max(50, powerScore(me.state));
  const ids: number[] = [];
  if (includeId && includeId !== me.id) {
    const r = await db.execute({
      sql: "SELECT id FROM users WHERE id = ? AND shield_until <= ? AND (clan_id IS NULL OR clan_id IS NOT ?)",
      args: [includeId, now, me.clanId],
    });
    if (r.rows[0]) ids.push(includeId);
  }
  const rs = await db.execute({
    sql: `SELECT id FROM users
          WHERE id != ? AND shield_until <= ? AND (clan_id IS NULL OR clan_id IS NOT ?)
          ORDER BY ABS(power - ?) ASC, RANDOM()
          LIMIT 6`,
    args: [me.id, now, me.clanId, myPower],
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
      population: Math.floor(s.population),
      power: powerScore(s),
      defense: scoutEstimate(s, me.state),
    });
  }
  return targets;
}

type StoredReport = RaidReport & {
  attackerName: string;
  defenderName: string;
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
export async function marchTo(me: Player, to: { target?: number; camp?: number }, units: Army, now: number) {
  const db = await getDb();
  const out = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM attacks WHERE attacker_id = ? AND status IN ${ACTIVE_ATTACK}`,
    args: [me.id],
  });

  if (Number(out.rows[0].n) >= MAX_MARCHES) throw new GameError(`You can have ${MAX_MARCHES} armies on the move at once`, "too_many");
  const home = await homeOf(me.id);
  const { dest, defenderId, campLevel } = await resolveTarget(me, to, now, home);

  // Across the sea the army sails, and takes the Longships it needs along.
  const naval = seaRoute(home, dest).naval;
  let sent!: Army;
  let travel = 0;
  const after = await mutatePlayer(me.id, now, (s) => {
    const boarded = embark(s, units, naval);
    const d = campLevel ? dispatchCamp(s, campLevel, boarded, now) : dispatchRaid(s, boarded, now);

    sent = d.sent;
    travel = routeMs(sent, home, dest, getRates(s).marchMultiplier);

    return d.state;
  });

  try {
    const ins = await db.execute({
      sql: `INSERT INTO attacks (attacker_id, defender_id, camp_level, units, from_x, from_y, to_x, to_y, sent_at, arrives_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [me.id, defenderId, campLevel, JSON.stringify(sent), home.x, home.y, dest.x, dest.y, now, now + travel],
    });

    if (defenderId) {
      // Warn the defender; with a Watchtower they also see which troops.
      const def = await findById(defenderId);
      const watch = (def?.state.buildings["watchtower"] ?? 0) >= 1;

      await notify.incoming(defenderId, displayName(me), watch ? sent : null, travel);
    }

    return { player: after, march: { id: Number(ins.lastInsertRowid), arrivesAt: now + travel } };
  } catch (e) {
    await mutatePlayer(me.id, now, (s) => cancelRaid(s, sent));
    throw e;
  }
}

type Target = { dest: Point; defenderId: number | null; campLevel: number | null; name: string };

/** Where an attack on a tribe or one of your camps goes, after checking it's allowed. */
async function resolveTarget(me: Player, to: { target?: number; camp?: number }, now: number, home: Point): Promise<Target> {
  const db = await getDb();

  if (to.camp) {
    const campLevel = Math.floor(Number(to.camp));
    const dest = (await campSpots(me.id, home, campLevel))[campLevel - 1];

    if (!dest) throw new GameError("Unknown camp");
    const busy = await db.execute({
      sql: `SELECT 1 FROM attacks WHERE attacker_id = ? AND camp_level = ? AND status IN ${ACTIVE_ATTACK} LIMIT 1`,
      args: [me.id, campLevel],
    });

    if (busy.rows.length) throw new GameError("An army is already on its way to this camp", "busy");

    return { dest, defenderId: null, campLevel, name: `Barbarian camp ${campLevel}` };
  }
  const defenderId = Math.floor(Number(to.target));

  if (defenderId === me.id) throw new GameError("You can't attack yourself");
  const target = await findById(defenderId);

  if (!target) throw new GameError("That tribe doesn't exist");
  if (me.clanId != null && target.clanId === me.clanId) throw new GameError("That tribe is in your clan. Clanmates don't raid each other.", "same_clan");
  if (target.state.shieldUntil > now) throw new GameError("This tribe is protected by a shield right now", "shielded");

  return { dest: await homeOf(defenderId), defenderId, campLevel: null, name: displayName(target) };
}

type AttackRow = {
  id: number;
  attackerId: number;
  defenderId: number | null;
  campLevel: number | null;
  units: Army;
  from: Point;
  to: Point;
  sentAt: number;
  arrivesAt: number;
  endsAt: number | null;
  battle: StoredBattle | null;
  /** Spoils carried from an earlier battle of this expedition (after new orders). */
  loot: Loot | null;
  coins: number;
  /** New orders this expedition already took. */
  hops: number;
  /** Set after new orders: the march home from the target takes this long (not the way it came). */
  homeMs: number | null;
};

/** A battle under way: decided when the armies met, played out until plan.endsAt. */
export type StoredBattle = {
  plan: BattlePlan;
  outcome: BattleOutcome;
  /** Defenders on the field (null at a barbarian camp). */
  engaged: Army | null;
};

const toAttack = (r: Record<string, unknown>): AttackRow => ({
  id: Number(r.id),
  attackerId: Number(r.attacker_id),
  defenderId: r.defender_id == null ? null : Number(r.defender_id),
  campLevel: r.camp_level == null ? null : Number(r.camp_level),
  units: { ...emptyArmy(), ...JSON.parse(String(r.units)) },
  from: { x: Number(r.from_x), y: Number(r.from_y) },
  to: { x: Number(r.to_x), y: Number(r.to_y) },
  sentAt: Number(r.sent_at),
  arrivesAt: Number(r.arrives_at),
  endsAt: r.ends_at == null ? null : Number(r.ends_at),
  battle: r.battle == null ? null : (JSON.parse(String(r.battle)) as StoredBattle),
  loot: r.loot == null ? null : (JSON.parse(String(r.loot)) as Loot),
  coins: Number(r.coins ?? 0),
  hops: Number(r.hops ?? 0),
  homeMs: r.home_ms == null ? null : Number(r.home_ms),
});

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
async function turnBack(a: AttackRow, attackerId: number, name: string | null, now: number) {
  const at = a.arrivesAt;

  await mutatePlayer(attackerId, now, (s) =>
    returnHome(s, a.units, name ?? "Abandoned land", at + homeTripMs(a), now, rand(), a.to, at, carriedOf(a))
  );
  await notify.turnedBack(attackerId, name ?? "The target");
}

/**
 * The armies meet. The fight is decided right away (from both sides as they
 * are now) but lasts a while: defenders leave home for the field, and the
 * result comes out when the last round ends (finishBattle).
 * Returns false when there was no battle and the army went home.
 */
async function beginBattle(a: AttackRow, now: number): Promise<boolean> {
  const at = a.arrivesAt;
  const db = await getDb();
  const terrain = terrainAt(a.to.x, a.to.y);
  const attacker = await findById(a.attackerId);

  if (!attacker) return false;

  let outcome!: BattleOutcome;
  let engaged: Army | null = null;
  let troops = troopsOnField(a.units);

  if (a.campLevel) {
    outcome = campOutcome(attacker.state, a.campLevel, a.units, rand(), { terrain });
    troops += Math.round(campDefense(a.campLevel) / CAMP_DEFENSE_PER_TROOP);
  } else {
    const defender = a.defenderId ? await findById(a.defenderId) : null;

    if (!defender) {
      await turnBack(a, attacker.id, null, now);

      return false;
    }
    const landing = seaRoute(a.from, a.to).naval;

    try {
      await mutatePlayer(defender.id, now, (s) => {
        if (s.shieldUntil > at) throw new GameError("This tribe is protected by a shield right now", "shielded");
        const r = raidOutcome(s, attacker.state, a.units, rand(), { terrain, landing });

        outcome = r.outcome;
        engaged = r.defenders;

        return engageDefenders(s, r.defenders);
      });
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      await turnBack(a, attacker.id, displayName(defender), now); // shielded by the time we got there

      return false;
    }
    troops += troopsOnField(engaged!);
  }

  const plan = planBattle(outcome, at, troops, rand());
  const battle: StoredBattle = { plan, outcome, engaged };

  try {
    await db.execute({
      sql: "UPDATE attacks SET status = 'fighting', ends_at = ?, battle = ? WHERE id = ?",
      args: [plan.endsAt, JSON.stringify(battle), a.id],
    });
  } catch (e) {
    // The defenders already left home for the field: send them back.
    if (a.defenderId && engaged) await mutatePlayer(a.defenderId, now, (s) => releaseDefenders(s, engaged!)).catch(() => {});
    throw e;
  }
  if (a.defenderId && plan.endsAt > now) {
    await notify.battleBegun(a.defenderId, displayName(attacker), plan.endsAt - now).catch(() => {});
  }

  return true;
}

/** The last round is over: the decided result is applied to both tribes. Times use the battle's end. */
async function finishBattle(a: AttackRow, now: number) {
  const { plan, outcome, engaged } = a.battle!;
  const at = plan.endsAt;
  const travelMs = homeTripMs(a);
  const carried = { carried: a.loot ?? undefined, carriedCoins: a.coins, hops: a.hops };
  const terrain = terrainAt(a.to.x, a.to.y);
  const landing = seaRoute(a.from, a.to).naval;
  const story = { battleMs: plan.endsAt - plan.startedAt, rounds: plan.rounds };
  const attacker = await findById(a.attackerId);

  if (!attacker) {
    if (a.defenderId && engaged) await mutatePlayer(a.defenderId, now, (s) => releaseDefenders(s, engaged));

    return;
  }

  if (a.campLevel) {
    let report!: RaidReport;

    await mutatePlayer(attacker.id, now, (s) => {
      const r = campBattle(s, a.campLevel!, a.units, at, rand(), { terrain, travelMs, from: a.to, outcome, ...carried });

      report = r.report;

      return r.state;
    });
    const full: StoredReport = { ...report, ...story, attackerName: displayName(attacker), defenderName: `Barbarian camp ${a.campLevel}` };

    await saveReport(attacker.id, null, a.campLevel, full, at, a.id);
    await notify.attackResult(attacker.id, full.defenderName, report, now);

    return;
  }

  const defender = a.defenderId ? await findById(a.defenderId) : null;

  if (!defender) {
    await turnBack(a, attacker.id, null, now);

    return;
  }
  let report!: RaidReport;

  await mutatePlayer(defender.id, now, (s) => {
    const r = defendRaid(s, attacker.state, a.units, at, rand(), {
      terrain,
      travelMs,
      from: a.to,
      landing,
      outcome,
      engaged: engaged ?? undefined,
      carried: carried.carried,
      carriedCoins: carried.carriedCoins,
    });

    report = r.report;

    return r.state;
  });
  const full: StoredReport = { ...report, ...story, attackerName: displayName(attacker), defenderName: displayName(defender) };
  let promoted: Promotion[] = [];

  await mutatePlayer(attacker.id, now, (s) => {
    const next = receiveRaidReport(s, report, full.defenderName, at, rand(), a.to, a.hops);

    promoted = promotionsBetween(s, next);

    return next;
  });
  full.attackerPromoted = promoted;
  await saveReport(attacker.id, defender.id, null, full, at, a.id);
  await Promise.all([
    notify.attackResult(attacker.id, full.defenderName, full, now),
    report.attackerWon
      ? notify.raided(defender.id, full.attackerName, report, attacker.id)
      : notify.defended(defender.id, full.attackerName, report),
  ]);
}

/** Something went wrong: everyone goes home with nothing, so no troops are lost to a bug. */
async function abandon(a: AttackRow, now: number, e: unknown) {
  // eslint-disable-next-line no-console
  console.error("battle failed, sending the armies home", a.id, e);
  await mutatePlayer(a.attackerId, now, (s) =>
    returnHome(s, a.units, "a failed march", now + 60_000, now, rand(), undefined, now, carriedOf(a))
  ).catch(() => {});
  if (a.defenderId && a.battle?.engaged) {
    await mutatePlayer(a.defenderId, now, (s) => releaseDefenders(s, a.battle!.engaged!)).catch(() => {});
  }
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
  const arrived = await db.execute({
    sql: `SELECT * FROM attacks WHERE status = 'marching' AND arrives_at <= ?${mine} ORDER BY arrives_at ASC LIMIT 20`,
    args: [now, ...who],
  });

  for (const row of arrived.rows) {
    const a = toAttack(row as Record<string, unknown>);
    const claim = await db.execute({
      sql: "UPDATE attacks SET status = 'resolving' WHERE id = ? AND status = 'marching'",
      args: [a.id],
    });

    if (claim.rowsAffected !== 1) continue; // another request took it
    let fighting = false;

    try {
      fighting = await beginBattle(a, now);
    } catch (e) {
      await abandon(a, now, e);
    }
    if (!fighting) await db.execute({ sql: "UPDATE attacks SET status = 'done' WHERE id = ?", args: [a.id] });
  }

  const ended = await db.execute({
    sql: `SELECT * FROM attacks WHERE status = 'fighting' AND ends_at <= ?${mine} ORDER BY ends_at ASC LIMIT 20`,
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
      await finishBattle(a, now);
    } catch (e) {
      await abandon(a, now, e);
    }
    await db.execute({ sql: "UPDATE attacks SET status = 'done' WHERE id = ?", args: [a.id] });
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
  const road = marchRoute(from, to);
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
  to: { target?: number; camp?: number },
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

  if (cur && cur.defenderId === t.defenderId && cur.campLevel === t.campLevel) {
    throw new GameError("The army is already marching there", "same_target");
  }

  // Ships go with whoever's road crosses the sea.
  const { go, back } = splitForRedirect(ex.units, keep, {
    go: seaRoute(ex.where, t.dest).naval || seaRoute(t.dest, home).naval,
    back: seaRoute(ex.where, home).naval,
  });
  const legMs = routeMs(go, ex.where, t.dest, mult);
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
    const ins = await db.execute({
      sql: `INSERT INTO attacks (attacker_id, defender_id, camp_level, units, from_x, from_y, to_x, to_y, sent_at, arrives_at,
                                 loot, coins, hops, home_ms, parent_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        me.id,
        t.defenderId,
        t.campLevel,
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
          WHERE attacker_id = ? OR defender_id = ?
          ORDER BY created_at DESC LIMIT 30`,
    args: [me.id, me.id],
  });
  return rs.rows.map((r) => {
    const report = JSON.parse(String(r.report)) as StoredReport;
    const asAttacker = Number(r.attacker_id) === me.id;
    return {
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

export async function leaderboard(me: Player, metric: LeaderboardMetric) {
  const col = metric === "power" ? "power" : metric === "wins" ? "wins" : "population";
  const db = await getDb();
  const [top, mine] = await db.batch(
    [
      `SELECT id, username, first_name, photo_url, population, power, wins, plus_until, clan_id FROM users ORDER BY ${col} DESC, id ASC LIMIT 50`,
      { sql: `SELECT ${col} AS v FROM users WHERE id = ?`, args: [me.id] },
    ],
    "read"
  );
  const myValue = Number(mine.rows[0]?.v ?? 0);
  const rankRs = await db.execute({ sql: `SELECT COUNT(*) + 1 AS r FROM users WHERE ${col} > ?`, args: [myValue] });
  const now = Date.now();

  return {
    metric,
    me: { rank: Number(rankRs.rows[0].r), value: Math.floor(myValue) },
    top: top.rows.map((r, i) => ({
      rank: i + 1,
      id: Number(r.id),
      name: String(r.first_name || (r.username ? `@${r.username}` : "Player")),
      photoUrl: avatarUrl(Number(r.id)),
      value: Math.floor(Number(r[col])),
      isMe: Number(r.id) === me.id,
      plus: Number(r.plus_until ?? 0) > now,
      /** In your clan: can't be attacked. */
      ally: Number(r.id) !== me.id && me.clanId != null && Number(r.clan_id) === me.clanId,
    })),
  };
}

export { armySize };
