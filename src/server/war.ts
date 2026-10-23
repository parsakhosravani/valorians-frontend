import "server-only";

import crypto from "crypto";

import { getDb } from "./db";
import { Player, findById, mutatePlayer } from "./players";

import { GameError, advance } from "@/lib/game/engine";
import {
  RaidReport,
  armySize,
  cancelRaid,
  defendRaid,
  dispatchRaid,
  powerScore,
  raidCamp,
  receiveRaidReport,
  scoutEstimate,
} from "@/lib/game/war";
import type { Army } from "@/lib/game/engine";

const rand = () => crypto.randomInt(0, 1_000_000) / 1_000_000;

export const displayName = (p: { username: string | null; firstName: string }) =>
  p.firstName || (p.username ? `@${p.username}` : "Player");

/** Up to 6 tribes the player can attack right now, near their own strength. */
export async function findTargets(me: Player, now: number) {
  const db = await getDb();
  const myPower = Math.max(50, powerScore(me.state));
  const rs = await db.execute({
    sql: `SELECT id FROM users
          WHERE id != ? AND shield_until <= ?
          ORDER BY ABS(power - ?) ASC, RANDOM()
          LIMIT 6`,
    args: [me.id, now, myPower],
  });
  const targets = [];
  for (const row of rs.rows) {
    const p = await findById(Number(row.id));
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
  now: number
) {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO battles (attacker_id, defender_id, camp_level, attacker_won, report, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [attackerId, defenderId, campLevel, report.attackerWon ? 1 : 0, JSON.stringify(report), now],
  });
}

/**
 * Raids another player. Three steps, each safe on its own:
 * 1. troops leave the attacker's tribe
 * 2. the battle is applied to the defender (fails cleanly if they're shielded)
 * 3. survivors march home to the attacker with the loot
 * If step 2 fails, step 1 is undone.
 */
export async function raidPlayer(me: Player, targetId: number, units: Army, now: number) {
  if (targetId === me.id) throw new GameError("You can't attack yourself");
  const target = await findById(targetId);
  if (!target) throw new GameError("That tribe doesn't exist");

  let sent!: Army;
  const after1 = await mutatePlayer(me.id, now, (s) => {
    const d = dispatchRaid(s, units, now);
    sent = d.sent;
    return d.state;
  });

  let report!: RaidReport;
  try {
    await mutatePlayer(targetId, now, (s) => {
      const r = defendRaid(s, after1.state, sent, now, rand());
      report = r.report;
      return r.state;
    });
  } catch (e) {
    await mutatePlayer(me.id, now, (s) => cancelRaid(s, sent));
    throw e;
  }

  const full: StoredReport = { ...report, attackerName: displayName(me), defenderName: displayName(target) };
  const done = await mutatePlayer(me.id, now, (s) => receiveRaidReport(s, report, full.defenderName, now, rand()));
  await saveReport(me.id, targetId, null, full, now);
  return { player: done, report: full };
}

export async function attackCamp(me: Player, level: number, units: Army, now: number) {
  let report!: RaidReport;
  const done = await mutatePlayer(me.id, now, (s) => {
    const r = raidCamp(s, level, units, now, rand());
    report = r.report;
    return r.state;
  });
  const full: StoredReport = { ...report, attackerName: displayName(me), defenderName: `Barbarian camp ${level}` };
  await saveReport(me.id, null, level, full, now);
  return { player: done, report: full };
}

export async function listReports(me: Player) {
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT id, attacker_id, defender_id, camp_level, attacker_won, report, created_at FROM battles
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
      campLevel: r.camp_level == null ? null : Number(r.camp_level),
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
