import "server-only";

import { isAdmin } from "./announce";
import { tg } from "./bot";
import { getDb } from "./db";

/**
 * /stats in the bot chat (admins only): how many players the game has, how
 * many came back lately, and what they paid. "Active" goes by last_seen_at,
 * which is only refreshed every few minutes (see players.ts), so it's rough.
 */

const DAY = 24 * 60 * 60 * 1000;
const fmt = (n: unknown) => Math.floor(Number(n ?? 0)).toLocaleString("en-US");

export async function gameStats(now = Date.now()) {
  const db = await getDb();
  const [users, clans, stars] = await db.batch(
    [
      {
        sql: `SELECT COUNT(*) AS total,
                SUM(created_at >= ?) AS new1, SUM(created_at >= ?) AS new7,
                SUM(last_seen_at >= ?) AS act1, SUM(last_seen_at >= ?) AS act7, SUM(last_seen_at >= ?) AS act30,
                SUM(plus_until > ?) AS plus, SUM(bot_blocked = 0) AS reachable
              FROM users`,
        args: [now - DAY, now - 7 * DAY, now - DAY, now - 7 * DAY, now - 30 * DAY, now],
      },
      "SELECT COUNT(*) AS n FROM clans",
      {
        sql: `SELECT COALESCE(SUM(stars), 0) AS total, COALESCE(SUM(CASE WHEN created_at >= ? THEN stars END), 0) AS last30
              FROM payments WHERE refunded_at IS NULL`,
        args: [now - 30 * DAY],
      },
    ],
    "read"
  );
  const u = users.rows[0] ?? {};

  return {
    total: Number(u.total ?? 0),
    new24h: Number(u.new1 ?? 0),
    new7d: Number(u.new7 ?? 0),
    active24h: Number(u.act1 ?? 0),
    active7d: Number(u.act7 ?? 0),
    active30d: Number(u.act30 ?? 0),
    plus: Number(u.plus ?? 0),
    reachable: Number(u.reachable ?? 0),
    clans: Number(clans.rows[0]?.n ?? 0),
    stars: Number(stars.rows[0]?.total ?? 0),
    stars30d: Number(stars.rows[0]?.last30 ?? 0),
  };
}

/** Replies with the numbers. False for non-admins, who get the normal menu instead. */
export async function sendStats(chatId: number, userId: number) {
  if (!(await isAdmin(userId))) return false;
  const s = await gameStats();

  await tg("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `📊 <b>Valorians stats</b>\n\n` +
      `👥 Players: <b>${fmt(s.total)}</b>\n` +
      `🆕 New: ${fmt(s.new24h)} today · ${fmt(s.new7d)} this week\n` +
      `🔥 Active: ${fmt(s.active24h)} today · ${fmt(s.active7d)} this week · ${fmt(s.active30d)} this month\n` +
      `📬 Reachable by the bot: ${fmt(s.reachable)}\n\n` +
      `👑 Plus now (incl. trials): ${fmt(s.plus)}\n` +
      `⭐ Stars earned: ${fmt(s.stars)} (${fmt(s.stars30d)} in the last 30 days)\n` +
      `🛡️ Clans: ${fmt(s.clans)}`,
  });

  return true;
}
