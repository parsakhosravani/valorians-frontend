import "server-only";

import { adminIds } from "./announce";
import { tg } from "./bot";
import { getDb } from "./db";
import { dayOf } from "./events";
import { buildReport, reportText, stuckNow } from "./eventReport";

/**
 * Live alerts: the admins hear about a bug on Telegram within minutes, not
 * at midnight. Each kind of problem alerts at most once per QUIET_MS, so a
 * crash on every request doesn't flood the chat; the nightly report still
 * counts every one of them.
 */

/** One alert per kind of problem per half hour (across all servers: claimed in `meta`). */
const QUIET_MS = 30 * 60_000;
/** Something stuck stays stuck between cron runs: remind every 2 hours, not every 5 minutes. */
const STUCK_QUIET_MS = 2 * 60 * 60_000;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Claims the right to send alert `key` now. False if it went out within `quietMs`. */
async function claim(key: string, now: number, quietMs: number) {
  const db = await getDb();
  const k = `alert:${key}`;
  const up = await db.execute({
    sql: "UPDATE meta SET value = ? WHERE key = ? AND CAST(value AS INTEGER) < ?",
    args: [String(now), k, now - quietMs],
  });

  if (up.rowsAffected === 1) return true;
  const ins = await db.execute({
    sql: "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
    args: [k, String(now)],
  });

  return ins.rowsAffected === 1;
}

async function sendToAdmins(text: string) {
  for (const id of await adminIds().catch(() => [] as number[])) {
    await tg("sendMessage", { chat_id: id, parse_mode: "HTML", text, disable_web_page_preview: true }).catch(() => {});
  }
}

/** Sends `text` to the admins unless alert `key` already went out lately. Never throws. */
export async function alertAdmins(key: string, text: string, now = Date.now(), quietMs = QUIET_MS) {
  try {
    if (await claim(key, now, quietMs)) await sendToAdmins(text);
  } catch (e) {
    console.error("alert failed", key, e);
  }
}

export type ErrorEvent = { at: number; kind: string; playerId: number | null; ctx: string | null; data: string };

/**
 * Error events just written to the log (see flushEvents): one alert per kind
 * of problem, e.g. "api POST /api/war/raid" or "war.abandon".
 */
export async function alertOnErrors(events: ErrorEvent[]) {
  const groups = new Map<string, ErrorEvent[]>();

  for (const e of events) {
    let data: Record<string, unknown> = {};

    try {
      data = JSON.parse(e.data);
    } catch {}
    const key = e.kind === "api" ? `api ${data.method} ${data.path}` : e.kind;

    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  for (const [key, xs] of groups) {
    const first = xs[0];
    let data: Record<string, unknown> = {};

    try {
      data = JSON.parse(first.data);
    } catch {}
    const what = String(data.error ?? (Array.isArray(data.bad) ? data.bad.join(", ") : "") ?? "").slice(0, 300);
    const text = [
      `🔴 <b>${esc(key)}</b>${xs.length > 1 ? ` ×${xs.length}` : ""}`,
      what && `<code>${esc(what)}</code>`,
      first.ctx && `in ${esc(first.ctx)}`,
      first.playerId != null && `player ${first.playerId}`,
      `<i>More like it are muted for 30 min; all are in tonight's report (/health).</i>`,
    ]
      .filter(Boolean)
      .join("\n");

    await alertAdmins(key, text, first.at);
  }
}

/**
 * Run by the cron every few minutes: anything stuck in the live tables right
 * now (battles past their end, trades never delivered, half-resolved attacks).
 * Armies waiting at the gates are normal, so only errors alert.
 */
export async function watchdog(now: number) {
  const stuck = (await stuckNow(now)).filter((f) => f.level === "error");

  for (const f of stuck) {
    await alertAdmins(
      `stuck:${f.check}`,
      `🟠 <b>${esc(f.check)}</b>\n${esc(f.detail)}\n<code>${esc(JSON.stringify(f.sample ?? []).slice(0, 600))}</code>`,
      now,
      STUCK_QUIET_MS
    );
  }

  return stuck.length;
}

/** /health in the bot chat (admins only): today's report so far. */
export async function sendHealth(chatId: number, userId: number) {
  if (!(await adminIds()).includes(userId)) return false;
  const report = await buildReport(dayOf(Date.now()));

  await tg("sendMessage", { chat_id: chatId, parse_mode: "HTML", text: reportText(report) });

  return true;
}
