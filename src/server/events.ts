import "server-only";

import { AsyncLocalStorage } from "async_hooks";

import { getDb } from "./db";

import type { GameState } from "@/lib/game/engine";

/**
 * The event log: one row for everything that happens in the game, so a day
 * can be read back and checked (see eventReport.ts). Every API call, every
 * save of a tribe (with what changed and why), every battle step, trade
 * delivery, payment, bot update and cron run.
 *
 * Writing must never slow a player down or break a request: events wait in
 * memory and go out in one INSERT after the response (flushEvents), and a
 * failed write is dropped with a console line, never thrown.
 *
 * Error events also alert the admins on Telegram right away (alerts.ts).
 *
 * The log is a working tool, not an archive: the cron deletes the previous
 * day once a day (see dailyLogJobs), after the day's report is made.
 */

export type EventLevel = "info" | "warn" | "error";

type Pending = {
  at: number;
  level: EventLevel;
  kind: string;
  playerId: number | null;
  ctx: string | null;
  data: string;
};

const pending: Pending[] = [];
/** Past this many waiting events, write them right away instead of waiting for the end of the request. */
const FLUSH_AT = 200;
/** No single event's data grows past this (a huge body or a long stack trace). */
const MAX_DATA = 4_000;

/**
 * What is going on right now, carried through awaits: the route being
 * served ("POST /api/war/raid") or the job ("battle:finish #812"). Saves
 * made inside are logged with it, so every change to a tribe says what caused it.
 */
const context = new AsyncLocalStorage<string>();

export const withEventContext = <T>(label: string, fn: () => Promise<T>): Promise<T> => context.run(label, fn);
export const eventContext = () => context.getStore() ?? null;

function clip(data: unknown): string {
  let s: string;

  try {
    s = JSON.stringify(data ?? {});
  } catch {
    s = JSON.stringify({ unserializable: String(data) });
  }

  return s.length > MAX_DATA ? JSON.stringify({ clipped: s.slice(0, MAX_DATA) }) : s;
}

/** Queues one event. Never throws. */
export function logEvent(
  kind: string,
  data: object = {},
  opts: { playerId?: number | null; level?: EventLevel; at?: number; ctx?: string | null } = {}
) {
  try {
    pending.push({
      at: opts.at ?? Date.now(),
      level: opts.level ?? "info",
      kind,
      playerId: opts.playerId ?? null,
      ctx: opts.ctx === undefined ? eventContext() : opts.ctx,
      data: clip(data),
    });
    // Errors also go to the server log, so they show in Vercel's error view (kept 7 days).
    if (opts.level === "error") console.error(`[valorians-event] ${kind}`, pending[pending.length - 1].ctx ?? "", pending[pending.length - 1].data);
    if (pending.length >= FLUSH_AT) void flushEvents();
  } catch (e) {
    console.error("logEvent", e);
  }
}

/** An error as plain data for the log: message, code and the top of the stack. */
export const errorData = (e: unknown) =>
  e instanceof Error
    ? { error: e.message, name: e.name, code: (e as { code?: unknown }).code ?? null, stack: e.stack?.split("\n").slice(0, 6).join("\n") }
    : { error: String(e) };

let flushing: Promise<void> = Promise.resolve();

/** Writes every waiting event in one statement. Safe to call any time, from anywhere. */
export function flushEvents(): Promise<void> {
  flushing = flushing.then(async () => {
    if (!pending.length) return;
    const batch = pending.splice(0, pending.length);

    try {
      const db = await getDb();

      // libSQL caps the number of arguments per statement: 6 per row, 100 rows a chunk.
      for (let i = 0; i < batch.length; i += 100) {
        const rows = batch.slice(i, i + 100);

        await db.execute({
          sql: `INSERT INTO event_log (at, level, kind, player_id, ctx, data) VALUES ${rows.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`,
          args: rows.flatMap((r) => [r.at, r.level, r.kind, r.playerId, r.ctx, r.data]),
        });
      }
    } catch (e) {
      console.error("writing the event log failed, dropped", batch.length, "events", e);
    }
    // The admins hear about errors now, not at midnight (see alerts.ts).
    const errors = batch.filter((r) => r.level === "error");

    if (errors.length) {
      // Loaded here: alerts.ts reaches the bot, which itself writes events.
      const { alertOnErrors } = await import("./alerts");

      await alertOnErrors(errors).catch((e) => console.error("alerts", e));
    }
  });

  return flushing;
}

const num = (n: unknown) => (typeof n === "number" ? n : 0);
const round = (n: number) => Math.round(n * 100) / 100;

function diff(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined, min = 0.5) {
  const out: Record<string, number> = {};

  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    const d = num(b?.[k]) - num(a?.[k]);

    if (Math.abs(d) >= min) out[k] = round(d);
  }

  return out;
}

/** Numbers that should never be negative, NaN or infinite. Returns the paths that are. */
export function badNumbers(s: GameState): string[] {
  const bad: string[] = [];
  const check = (path: string, v: unknown) => {
    if (typeof v !== "number") return;
    if (!Number.isFinite(v) || v < -1e-6) bad.push(`${path}=${v}`);
  };

  for (const [k, v] of Object.entries(s.resources ?? {})) check(`resources.${k}`, v);
  for (const [k, v] of Object.entries(s.army ?? {})) check(`army.${k}`, v);
  for (const [k, v] of Object.entries(s.buildings ?? {})) check(`buildings.${k}`, v);
  check("coins", s.coins);
  check("population", s.population);
  check("energy", s.energy);

  return bad;
}

/**
 * What a save changed, small enough to log on every save: resources, coins
 * and people moved, building levels, troops at home, and how many things are
 * queued, training or marching. `bad` lists numbers that broke the game's
 * laws (negative, NaN): a bug, logged as an error.
 */
export function stateChange(before: GameState, after: GameState) {
  const buildings: Record<string, [number, number]> = {};

  for (const k of Object.keys(after.buildings ?? {})) {
    const from = num((before.buildings as Record<string, number>)?.[k]);
    const to = num((after.buildings as Record<string, number>)[k]);

    if (from !== to) buildings[k] = [from, to];
  }
  const out: Record<string, unknown> = {};
  const res = diff(before.resources, after.resources);
  const army = diff(before.army, after.army);
  const coins = round(num(after.coins) - num(before.coins));
  const people = round(num(after.population) - num(before.population));
  const counts = {
    queue: (after.queue?.length ?? 0) - (before.queue?.length ?? 0),
    training: (after.training?.length ?? 0) - (before.training?.length ?? 0),
    marches: (after.marches?.length ?? 0) - (before.marches?.length ?? 0),
  };

  if (Object.keys(res).length) out.res = res;
  if (Math.abs(coins) >= 0.5) out.coins = coins;
  if (Math.abs(people) >= 0.5) out.people = people;
  if (Object.keys(buildings).length) out.buildings = buildings;
  if (Object.keys(army).length) out.army = army;
  for (const [k, v] of Object.entries(counts)) if (v) out[k] = v;
  if (after.shieldUntil !== before.shieldUntil) out.shieldUntil = after.shieldUntil;
  const bad = badNumbers(after);

  if (bad.length) out.bad = bad;

  return out;
}

/** The request body as logged: short, and without anything that looks like a secret. */
export function safeBody(body: unknown) {
  if (!body || typeof body !== "object") return body ?? null;
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(body as Record<string, unknown>).slice(0, 20)) {
    out[k] = /token|secret|password|hash|init_?data|auth/i.test(k) ? "[hidden]" : typeof v === "string" && v.length > 200 ? `${v.slice(0, 200)}…` : v;
  }

  return out;
}

/**
 * The game's day for the log: Tehran time (UTC+3:30, no daylight saving since
 * 2022), where the owner reads the reports. EVENT_DAY_OFFSET_MIN overrides it.
 */
export const DAY_OFFSET_MS = Number(process.env.EVENT_DAY_OFFSET_MIN ?? 210) * 60_000;
const DAY = 86_400_000;

/** "2026-11-04": the log day `at` falls on. */
export const dayOf = (at: number) => new Date(at + DAY_OFFSET_MS).toISOString().slice(0, 10);
/** When the log day `day` starts and ends (ms, UTC). */
export function dayRange(day: string): [number, number] {
  const start = Date.parse(`${day}T00:00:00Z`) - DAY_OFFSET_MS;

  return [start, start + DAY];
}
