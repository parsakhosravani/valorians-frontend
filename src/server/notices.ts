import "server-only";

import { getDb } from "./db";

/**
 * The in-game inbox: every message the bot sends a player (notify.ts) is also
 * kept here and shown behind the bell in the header. Many players never
 * started the bot or have it muted, and before this the game itself never
 * told them their Watchtower caught a spy or that they were raided.
 */

/** How many notices a player keeps; older ones are dropped as new ones come in. */
export const NOTICES_KEPT = 50;

export type Notice = { id: number; at: number; html: string; button: string; path: string; read: boolean };

export async function recordNotice(userId: number, html: string, button: string, path: string, now = Date.now()) {
  const db = await getDb();

  await db.execute({
    sql: "INSERT INTO notices (user_id, created_at, html, button, path) VALUES (?, ?, ?, ?, ?)",
    args: [userId, now, html, button, path],
  });
  // Keep the inbox short: drop what's past the newest NOTICES_KEPT.
  await db.execute({
    sql: `DELETE FROM notices WHERE user_id = ? AND id NOT IN
            (SELECT id FROM notices WHERE user_id = ? ORDER BY id DESC LIMIT ?)`,
    args: [userId, userId, NOTICES_KEPT],
  });
}

export async function listNotices(userId: number): Promise<Notice[]> {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT id, created_at, html, button, path, read FROM notices WHERE user_id = ? ORDER BY id DESC LIMIT ?",
    args: [userId, NOTICES_KEPT],
  });

  return rs.rows.map((r) => ({
    id: Number(r.id),
    at: Number(r.created_at),
    html: String(r.html),
    button: String(r.button),
    path: String(r.path),
    read: Number(r.read) === 1,
  }));
}

export async function unreadNotices(userId: number): Promise<number> {
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT COUNT(*) AS n FROM notices WHERE user_id = ? AND read = 0", args: [userId] });

  return Number(rs.rows[0]?.n ?? 0);
}

/** Marks every notice up to `upTo` (the newest one the player saw) as read. */
export async function markNoticesRead(userId: number, upTo: number) {
  const db = await getDb();

  await db.execute({ sql: "UPDATE notices SET read = 1 WHERE user_id = ? AND id <= ? AND read = 0", args: [userId, upTo] });
}
