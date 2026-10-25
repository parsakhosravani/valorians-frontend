import "server-only";

import crypto from "crypto";

import { getDb } from "./db";
import { homeOf } from "./map";
import { Player, findById, mutatePlayer } from "./players";

import { GameError, advance, emptyArmy, getRates } from "@/lib/game/engine";
import { MAX_LOOT_SHARE, RESOURCE_IDS, UNIT_IDS } from "@/lib/game/config";
import { Point, campPosition, distance, marchMs, scoutCost, terrainAt } from "@/lib/game/map";
import {
  RaidReport,
  armySize,
  battleNumbers,
  campBattle,
  cancelRaid,
  defendRaid,
  dispatchCamp,
  dispatchRaid,
  powerScore,
  receiveRaidReport,
  returnHome,
  scoutEstimate,
} from "@/lib/game/war";
import type { Army } from "@/lib/game/engine";

/** Most armies one tribe can have out at once. */
const MAX_MARCHES = 5;

const rand = () => crypto.randomInt(0, 1_000_000) / 1_000_000;

export const displayName = (p: { username: string | null; firstName: string }) =>
  p.firstName || (p.username ? `@${p.username}` : "Player");

/** Up to 6 tribes the player can attack right now, near their own strength. */
export async function findTargets(me: Player, now: number, includeId?: number) {
  const db = await getDb();
  const myPower = Math.max(50, powerScore(me.state));
  const ids: number[] = [];
  if (includeId && includeId !== me.id) {
    const r = await db.execute({ sql: "SELECT id FROM users WHERE id = ? AND shield_until <= ?", args: [includeId, now] });
    if (r.rows[0]) ids.push(includeId);
  }
  const rs = await db.execute({
    sql: `SELECT id FROM users
          WHERE id != ? AND shield_until <= ?
          ORDER BY ABS(power - ?) ASC, RANDOM()
          LIMIT 6`,
    args: [me.id, now, myPower],
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
      photoUrl: p.photoUrl,
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
    sql: "SELECT COUNT(*) AS n FROM attacks WHERE attacker_id = ? AND status IN ('marching','resolving')",
    args: [me.id],
  });

  if (Number(out.rows[0].n) >= MAX_MARCHES) throw new GameError(`You can have ${MAX_MARCHES} armies on the move at once`, "too_many");
  const home = await homeOf(me.id);
  let dest: Point;
  let defenderId: number | null = null;
  let campLevel: number | null = null;

  if (to.camp) {
    campLevel = Math.floor(Number(to.camp));
    dest = campPosition(me.id, campLevel, home);
    const busy = await db.execute({
      sql: "SELECT 1 FROM attacks WHERE attacker_id = ? AND camp_level = ? AND status IN ('marching','resolving') LIMIT 1",
      args: [me.id, campLevel],
    });

    if (busy.rows.length) throw new GameError("An army is already on its way to this camp", "busy");
  } else {
    defenderId = Math.floor(Number(to.target));
    if (defenderId === me.id) throw new GameError("You can't attack yourself");
    const target = await findById(defenderId);

    if (!target) throw new GameError("That tribe doesn't exist");
    if (target.state.shieldUntil > now) throw new GameError("This tribe is protected by a shield right now", "shielded");
    dest = await homeOf(defenderId);
  }

  let sent!: Army;
  let travel = 0;
  const after = await mutatePlayer(me.id, now, (s) => {
    const d = campLevel ? dispatchCamp(s, campLevel, units, now) : dispatchRaid(s, units, now);

    sent = d.sent;
    travel = marchMs(sent, distance(home, dest), getRates(s).marchMultiplier);

    return d.state;
  });

  try {
    const ins = await db.execute({
      sql: `INSERT INTO attacks (attacker_id, defender_id, camp_level, units, from_x, from_y, to_x, to_y, sent_at, arrives_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [me.id, defenderId, campLevel, JSON.stringify(sent), home.x, home.y, dest.x, dest.y, now, now + travel],
    });

    return { player: after, march: { id: Number(ins.lastInsertRowid), arrivesAt: now + travel } };
  } catch (e) {
    await mutatePlayer(me.id, now, (s) => cancelRaid(s, sent));
    throw e;
  }
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
});

/** The battle at the end of one march. Times use the arrival moment. */
async function resolveAttack(a: AttackRow, now: number) {
  const at = a.arrivesAt;
  const travelMs = a.arrivesAt - a.sentAt;
  const terrain = terrainAt(a.to.x, a.to.y);
  const attacker = await findById(a.attackerId);

  if (!attacker) return;

  if (a.campLevel) {
    let report!: RaidReport;

    await mutatePlayer(attacker.id, now, (s) => {
      const r = campBattle(s, a.campLevel!, a.units, at, rand(), { terrain, travelMs, from: a.to });

      report = r.report;

      return r.state;
    });
    const full: StoredReport = { ...report, attackerName: displayName(attacker), defenderName: `Barbarian camp ${a.campLevel}` };

    await saveReport(attacker.id, null, a.campLevel, full, at, a.id);

    return;
  }

  const defender = a.defenderId ? await findById(a.defenderId) : null;
  let report: RaidReport | null = null;

  if (defender) {
    try {
      await mutatePlayer(defender.id, now, (s) => {
        const r = defendRaid(s, attacker.state, a.units, at, rand(), { terrain, travelMs, from: a.to });

        report = r.report;

        return r.state;
      });
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      report = null; // shielded by the time we got there
    }
  }

  if (!report || !defender) {
    // Nobody to fight: the army turns round and walks home.
    await mutatePlayer(attacker.id, now, (s) =>
      returnHome(s, a.units, defender ? displayName(defender) : "Abandoned land", at + travelMs, now, rand(), a.to)
    );

    return;
  }
  const r: RaidReport = report;
  const full: StoredReport = { ...r, attackerName: displayName(attacker), defenderName: displayName(defender) };

  await mutatePlayer(attacker.id, now, (s) => receiveRaidReport(s, r, full.defenderName, at, rand(), a.to));
  await saveReport(attacker.id, defender.id, null, full, at, a.id);
}

/**
 * Fights every battle whose army has arrived. Called at the start of war
 * requests and sign-in, so results appear the next time anyone looks.
 */
export async function resolveDueAttacks(now: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT * FROM attacks WHERE status = 'marching' AND arrives_at <= ? ORDER BY arrives_at ASC LIMIT 20",
    args: [now],
  });

  for (const row of rs.rows) {
    const a = toAttack(row as Record<string, unknown>);
    const claim = await db.execute({
      sql: "UPDATE attacks SET status = 'resolving' WHERE id = ? AND status = 'marching'",
      args: [a.id],
    });

    if (claim.rowsAffected !== 1) continue; // another request took it
    try {
      await resolveAttack(a, now);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("battle failed, sending the army home", a.id, e);
      await mutatePlayer(a.attackerId, now, (s) => returnHome(s, a.units, "a failed march", now + 60_000, now, rand())).catch(() => {});
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
  const progress = Math.min(1, walked / Math.max(1, a.arrivesAt - a.sentAt));
  const where = { x: a.from.x + (a.to.x - a.from.x) * progress, y: a.from.y + (a.to.y - a.from.y) * progress };

  return mutatePlayer(me.id, now, (s) => returnHome(s, a.units, "recalled", now + walked, now, rand(), where));
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
      `SELECT id, username, first_name, photo_url, population, power, wins FROM users ORDER BY ${col} DESC, id ASC LIMIT 50`,
      { sql: `SELECT ${col} AS v FROM users WHERE id = ?`, args: [me.id] },
    ],
    "read"
  );
  const myValue = Number(mine.rows[0]?.v ?? 0);
  const rankRs = await db.execute({ sql: `SELECT COUNT(*) + 1 AS r FROM users WHERE ${col} > ?`, args: [myValue] });
  return {
    metric,
    me: { rank: Number(rankRs.rows[0].r), value: Math.floor(myValue) },
    top: top.rows.map((r, i) => ({
      rank: i + 1,
      id: Number(r.id),
      name: String(r.first_name || (r.username ? `@${r.username}` : "Player")),
      photoUrl: r.photo_url == null ? null : String(r.photo_url),
      value: Math.floor(Number(r[col])),
      isMe: Number(r.id) === me.id,
    })),
  };
}

export { armySize };
