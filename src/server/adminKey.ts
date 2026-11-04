import "server-only";

import crypto from "crypto";
import { NextRequest } from "next/server";

/**
 * The event log holds every player's moves, so reading it needs a key:
 * EVENT_LOG_KEY (or CRON_SECRET), sent as `Authorization: Bearer <key>` or
 * `?key=<key>` (for tools that can only open a URL). No key set: closed.
 */
export function hasLogKey(req: NextRequest) {
  const key = process.env.EVENT_LOG_KEY || process.env.CRON_SECRET;

  if (!key) return false;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("key") || "";
  const a = Buffer.from(given);
  const b = Buffer.from(key);

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
