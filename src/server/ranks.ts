import "server-only";

import { getDb } from "./db";

/**
 * Ranks, worked out for everyone at once and kept in columns: players by
 * population, power and wins (users.pop_rank, power_rank, wins_rank), and
 * clans by their members' total population (clans.pop_rank, with the totals
 * in clans.sum_*).
 *
 * They used to be counted on every request: each action counted every player
 * ahead of you (more rows the lower you are), and the Clan screen added up
 * every member of every clan up to three times. Now one pass sorts everyone,
 * at most once a minute for the whole game, and writes only the ranks that
 * moved. Ties go to the older id, as the leaderboard lists them.
 */
const RANKS_EVERY_MS = 60_000;

const PLAYER_RANKS = `
  UPDATE users SET pop_rank = r.p, power_rank = r.w, wins_rank = r.v
  FROM (SELECT id,
               ROW_NUMBER() OVER (ORDER BY population DESC, id ASC) AS p,
               ROW_NUMBER() OVER (ORDER BY power DESC, id ASC) AS w,
               ROW_NUMBER() OVER (ORDER BY wins DESC, id ASC) AS v
        FROM users) AS r
  WHERE users.id = r.id
    AND (users.pop_rank IS NOT r.p OR users.power_rank IS NOT r.w OR users.wins_rank IS NOT r.v)`;

const CLAN_RANKS = `
  UPDATE clans SET sum_members = t.m, sum_population = t.p, sum_power = t.w, sum_wins = t.v, pop_rank = t.r
  FROM (SELECT c.id, COUNT(u.id) AS m,
               COALESCE(SUM(u.population), 0) AS p,
               COALESCE(SUM(u.power), 0) AS w,
               COALESCE(SUM(u.wins), 0) AS v,
               ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(u.population), 0) DESC, c.id ASC) AS r
        FROM clans c LEFT JOIN users u ON u.clan_id = c.id
        GROUP BY c.id) AS t
  WHERE clans.id = t.id
    AND (clans.sum_members IS NOT t.m OR clans.sum_population IS NOT t.p OR clans.sum_power IS NOT t.w
         OR clans.sum_wins IS NOT t.v OR clans.pop_rank IS NOT t.r)`;

let lastTry = 0;

/**
 * Re-ranks everyone if the last pass is over a minute old. Many requests may
 * ask at once, on many server instances: the one that moves meta.ranks_at
 * forward does the work, the rest return straight away (with ranks at most
 * a minute old).
 */
export async function maybeRefreshRanks(now = Date.now()) {
  if (now - lastTry < 10_000) return false;
  lastTry = now;
  const db = await getDb();
  const claim = await db.execute({
    sql: `INSERT INTO meta (key, value) VALUES ('ranks_at', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(meta.value AS INTEGER) <= ?`,
    args: [String(now), now - RANKS_EVERY_MS],
  });

  if (!claim.rowsAffected) return false;
  await db.batch([PLAYER_RANKS, CLAN_RANKS], "write");

  return true;
}

