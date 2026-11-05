import "server-only";

import { getDb } from "./db";
import { dayOf, dayRange, flushEvents, logEvent } from "./events";
import { adminIds } from "./announce";
import { tg } from "./bot";

/**
 * The nightly check of the event log: reads a day back and looks for flows
 * that went wrong. Every finding is something a player could feel: an API
 * that crashed, an army or a load of goods stuck on the road, a battle that
 * started and never ended, a tribe saved with negative or NaN numbers, the
 * cron going quiet. The report goes to the admins on Telegram and is served
 * at /api/admin/report for a deeper review.
 */

export type Finding = { level: "error" | "warn"; check: string; detail: string; count?: number; sample?: unknown[] };

type Row = { id: number; at: number; level: string; kind: string; playerId: number | null; ctx: string | null; data: any };

const toRow = (r: Record<string, unknown>): Row => {
  let data: unknown = {};

  try {
    data = JSON.parse(String(r.data));
  } catch {
    data = { raw: String(r.data) };
  }

  return {
    id: Number(r.id),
    at: Number(r.at),
    level: String(r.level),
    kind: String(r.kind),
    playerId: r.player_id == null ? null : Number(r.player_id),
    ctx: r.ctx == null ? null : String(r.ctx),
    data,
  };
};

/** Raw events, newest first, for drilling into a finding. */
export async function listEvents(q: {
  from?: number;
  to?: number;
  kind?: string;
  playerId?: number;
  level?: string;
  ctx?: string;
  limit?: number;
}) {
  const db = await getDb();
  const where: string[] = [];
  const args: (string | number)[] = [];
  const filter = (sql: string, arg: string | number) => {
    where.push(sql);
    args.push(arg);
  };

  if (q.from != null) filter("at >= ?", q.from);
  if (q.to != null) filter("at < ?", q.to);
  // "war." matches every war event.
  if (q.kind) {
    if (q.kind.endsWith(".")) filter("kind LIKE ?", `${q.kind}%`);
    else filter("kind = ?", q.kind);
  }
  if (q.playerId != null) filter("player_id = ?", q.playerId);
  if (q.level) filter("level = ?", q.level);
  if (q.ctx) filter("ctx LIKE ?", `%${q.ctx}%`);
  const limit = Math.min(Math.max(1, q.limit ?? 200), 1000);
  const rs = await db.execute({
    sql: `SELECT * FROM event_log ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ${limit}`,
    args,
  });

  return rs.rows.map((r) => toRow(r as Record<string, unknown>));
}

const p95 = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);

  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
};

/** Stuck if this long past due: the cron runs every 5 minutes, so 30 is six missed sweeps. */
const STUCK_MS = 30 * 60_000;
/** The cron should run every 5 minutes; GitHub's schedule is often late, so warn only past this. */
const CRON_GAP_MS = 45 * 60_000;
/** A route this slow at p95 is worth a look. */
const SLOW_MS = 3_000;

/** Reads the day's events (Tehran day, see dayOf) and checks every flow. */
export async function buildReport(day: string, now = Date.now()) {
  await flushEvents();
  const db = await getDb();
  const [from, to] = dayRange(day);
  const rs = await db.execute({ sql: "SELECT * FROM event_log WHERE at >= ? AND at < ? ORDER BY at ASC", args: [from, to] });
  const events = rs.rows.map((r) => toRow(r as Record<string, unknown>));
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push({ ...f, sample: f.sample?.slice(0, 5) });

  // --- What happened ---
  const kinds: Record<string, number> = {};
  const levels: Record<string, number> = { info: 0, warn: 0, error: 0 };
  const players = new Set<number>();
  type RouteStat = { calls: number; ok: number; refused: Record<string, number>; crashed: number; ms: number[] };
  const routes: Record<string, RouteStat> = {};

  for (const e of events) {
    kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    levels[e.level] = (levels[e.level] ?? 0) + 1;
    if (e.playerId != null) players.add(e.playerId);
    if (e.kind !== "api") continue;
    const key = `${e.data.method} ${e.data.path}`;
    const r = (routes[key] ??= { calls: 0, ok: 0, refused: {}, crashed: 0, ms: [] });

    r.calls++;
    r.ms.push(Number(e.data.ms) || 0);
    if (e.data.status < 400) r.ok++;
    else if (e.data.status >= 500) r.crashed++;
    else r.refused[e.data.code ?? "?"] = (r.refused[e.data.code ?? "?"] ?? 0) + 1;
  }
  const routeTable = Object.fromEntries(
    Object.entries(routes)
      .sort((a, b) => b[1].calls - a[1].calls)
      .map(([k, r]) => [k, { calls: r.calls, ok: r.ok, crashed: r.crashed, refused: r.refused, p95ms: p95(r.ms) }])
  );

  // --- Checks on the log ---
  const crashes = events.filter((e) => e.kind === "api" && e.data.status >= 500);

  if (crashes.length) {
    add({
      level: "error",
      check: "api_crash",
      detail: `${crashes.length} API calls answered 500 (a bug, not a refused move)`,
      count: crashes.length,
      sample: crashes.map((e) => ({ at: e.at, player: e.playerId, route: e.ctx, body: e.data.body, error: e.data.error, stack: e.data.stack })),
    });
  }
  for (const [k, r] of Object.entries(routes)) {
    const refused = Object.values(r.refused).reduce((a, b) => a + b, 0);

    // Most calls refused: the client may be offering a move the server always says no to.
    if (r.calls >= 20 && refused / r.calls > 0.5) {
      add({ level: "warn", check: "route_mostly_refused", detail: `${k}: ${refused} of ${r.calls} calls refused (${JSON.stringify(r.refused)})`, count: refused });
    }
    if (r.calls >= 20 && p95(r.ms) > SLOW_MS) add({ level: "warn", check: "route_slow", detail: `${k}: p95 ${p95(r.ms)} ms over ${r.calls} calls` });
  }
  const badSaves = events.filter((e) => e.kind === "save" && e.data.bad);

  if (badSaves.length) {
    add({
      level: "error",
      check: "bad_numbers",
      detail: `${badSaves.length} saves left a tribe with negative or NaN numbers`,
      count: badSaves.length,
      sample: badSaves.map((e) => ({ at: e.at, player: e.playerId, ctx: e.ctx, bad: e.data.bad })),
    });
  }
  const clashes = events.filter((e) => e.kind === "save.clash");

  if (clashes.length) {
    add({ level: "error", check: "save_clash", detail: `${clashes.length} saves gave up after 8 clashes ("Too many simultaneous updates")`, count: clashes.length, sample: clashes.map((e) => ({ at: e.at, player: e.playerId, ctx: e.ctx })) });
  }
  for (const kind of ["war.abandon", "trade.deliver_failed"]) {
    const xs = events.filter((e) => e.kind === kind);

    if (xs.length) {
      add({ level: "error", check: kind.replace(".", "_"), detail: `${xs.length} × ${kind}`, count: xs.length, sample: xs.map((e) => ({ at: e.at, player: e.playerId, ...e.data })) });
    }
  }
  const botFails = events.filter((e) => e.kind === "bot.update" && e.level === "error");

  if (botFails.length) {
    add({ level: "error", check: "bot_update_failed", detail: `${botFails.length} bot updates threw`, count: botFails.length, sample: botFails.map((e) => e.data) });
  }
  // Any other event the code marked as an error.
  const otherErrors = events.filter((e) => e.level === "error" && !["api", "save", "save.clash", "war.abandon", "trade.deliver_failed", "bot.update"].includes(e.kind));

  if (otherErrors.length) {
    add({ level: "error", check: "other_errors", detail: `${otherErrors.length} other error events`, count: otherErrors.length, sample: otherErrors.map((e) => ({ kind: e.kind, at: e.at, ...e.data })) });
  }

  // War flow: every battle that began should have finished (or still be on), every march arrived.
  const begun = events.filter((e) => e.kind === "war.begin");
  const ended = new Set(events.filter((e) => e.kind === "war.finish" || e.kind === "war.abandon").map((e) => Number(e.data.id)));
  const openBattles = begun.filter((e) => !ended.has(Number(e.data.id)) && Number(e.data.endsAt) < Math.min(now, to) - STUCK_MS);

  if (openBattles.length) {
    add({
      level: "error",
      check: "battle_never_finished",
      detail: `${openBattles.length} battles began and were not finished 30 min after their end`,
      count: openBattles.length,
      sample: openBattles.map((e) => ({ id: e.data.id, endsAt: e.data.endsAt, player: e.playerId })),
    });
  }
  // A paid move that changed nothing: the move said yes but the save shows no cost.
  const paidRoutes = ["/api/buildings/upgrade", "/api/war/train", "/api/skills/upgrade", "/api/outposts/found"];
  const freeMoves = events.filter((e) => e.kind === "api" && e.data.status === 200 && paidRoutes.includes(e.data.path)).filter((api) => {
    const saves = events.filter((s) => s.kind === "save" && s.playerId === api.playerId && s.ctx === api.ctx && Math.abs(s.at - api.at) < 10_000);

    return !saves.some((s) => Object.values((s.data.res ?? {}) as Record<string, number>).some((d) => d < 0) || (s.data.coins ?? 0) < 0);
  });

  if (freeMoves.length) {
    add({
      level: "warn",
      check: "paid_move_cost_nothing",
      detail: `${freeMoves.length} paid moves (build, train, skill, outpost) saved without spending anything`,
      count: freeMoves.length,
      sample: freeMoves.map((e) => ({ at: e.at, player: e.playerId, route: e.data.path, body: e.data.body })),
    });
  }

  // Cron: it is what fights battles when nobody is online.
  const crons = events.filter((e) => e.kind === "cron.run").map((e) => e.at);
  let gap = 0;

  for (let i = 1; i < crons.length; i++) gap = Math.max(gap, crons[i] - crons[i - 1]);
  if (crons.length) gap = Math.max(gap, crons[0] - from, Math.min(now, to) - crons[crons.length - 1]);
  if (!crons.length && Math.min(now, to) - from > CRON_GAP_MS) add({ level: "error", check: "cron_silent", detail: "The cron never ran this day" });
  else if (gap > CRON_GAP_MS) add({ level: "warn", check: "cron_gap", detail: `Longest gap between cron runs: ${Math.round(gap / 60_000)} min` });

  // --- Checks on the live tables: things stuck right now ---
  for (const f of await stuckNow(now)) add(f);

  const errors = findings.filter((f) => f.level === "error").length;

  return {
    day,
    from,
    to,
    madeAt: now,
    verdict: errors ? "bugs" : findings.length ? "check" : "ok",
    totals: { events: events.length, players: players.size, levels, kinds },
    findings,
    routes: routeTable,
    war: {
      marches: kinds["war.march"] ?? 0,
      begun: begun.length,
      finished: kinds["war.finish"] ?? 0,
      turnedBack: kinds["war.turnback"] ?? 0,
      abandoned: kinds["war.abandon"] ?? 0,
    },
  };
}

/**
 * Things stuck in the live tables right now: battles past their end, attacks
 * left half-resolved by a crash, trades never delivered, armies at the gates
 * too long. Used by the day report and by the cron's watchdog (see alerts.ts).
 */
export async function stuckNow(now: number): Promise<Finding[]> {
  const db = await getDb();
  const out: Finding[] = [];
  const stuck = async (sql: string) => (await db.execute({ sql, args: [now - STUCK_MS] })).rows.map((r) => ({ ...r }));
  const stuckMarch = await stuck("SELECT id, attacker_id, defender_id, arrives_at FROM attacks WHERE status = 'marching' AND arrives_at < ? LIMIT 20");
  const stuckFight = await stuck("SELECT id, attacker_id, defender_id, ends_at FROM attacks WHERE status = 'fighting' AND ends_at < ? LIMIT 20");
  const stuckResolving = await stuck(
    "SELECT id, attacker_id, defender_id, arrives_at, ends_at FROM attacks WHERE status = 'resolving' AND COALESCE(ends_at, arrives_at) < ? LIMIT 20"
  );
  const stuckTrades = await stuck(
    "SELECT id, seller_id, buyer_id, status, arrives_at FROM trades WHERE status IN ('accepted', 'seller-paid', 'delivering') AND arrives_at < ? LIMIT 20"
  );
  const sample = (xs: unknown[]) => xs.slice(0, 5);

  // Armies waiting at the gates of a village still fighting are expected (one battle at a time), so marching ones are a warning.
  if (stuckMarch.length) out.push({ level: "warn", check: "army_waiting_long", detail: `${stuckMarch.length} armies arrived 30+ min ago and have not fought (waiting at the gates, or stuck)`, count: stuckMarch.length, sample: sample(stuckMarch) });
  if (stuckFight.length) out.push({ level: "error", check: "battle_stuck", detail: `${stuckFight.length} battles past their end and still 'fighting'`, count: stuckFight.length, sample: sample(stuckFight) });
  if (stuckResolving.length) out.push({ level: "error", check: "attack_stuck_resolving", detail: `${stuckResolving.length} attacks left in 'resolving' (a crash between claim and finish)`, count: stuckResolving.length, sample: sample(stuckResolving) });
  if (stuckTrades.length) out.push({ level: "error", check: "trade_stuck", detail: `${stuckTrades.length} trades past arrival and not delivered`, count: stuckTrades.length, sample: sample(stuckTrades) });

  return out;
}

export type DayReport = Awaited<ReturnType<typeof buildReport>>;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The report as a short Telegram message for the admins. */
export function reportText(r: DayReport) {
  const head = r.verdict === "ok" ? "✅" : r.verdict === "check" ? "🟡" : "🔴";
  const lines = [
    `${head} <b>Event log ${r.day}</b>`,
    `${r.totals.events} events, ${r.totals.players} players, ${r.totals.levels.error ?? 0} errors`,
    `⚔️ ${r.war.marches} marches, ${r.war.begun} battles, ${r.war.finished} finished, ${r.war.abandoned} abandoned`,
  ];

  if (!r.findings.length) lines.push("", "Every flow checked out.");
  else {
    lines.push("");
    for (const f of r.findings.slice(0, 12)) lines.push(`${f.level === "error" ? "🔴" : "🟡"} <b>${esc(f.check)}</b>: ${esc(f.detail)}`);
  }

  return lines.join("\n");
}

const DAY = 86_400_000;

/**
 * Once a day, at the first cron run after midnight (Tehran): report on the
 * day that just ended, send it to the admins, keep it in `meta`, then delete
 * every event before today. So the log only ever holds today (and, until the
 * next run, yesterday's last minutes).
 */
export async function dailyLogJobs(now: number) {
  const db = await getDb();
  const today = dayOf(now);
  const rs = await db.execute("SELECT value FROM meta WHERE key = 'event_log_day'");
  const last = rs.rows[0] ? String(rs.rows[0].value) : null;

  if (last === today) return null;
  // Claim the day first, so two cron runs at once don't both report and delete.
  const claim = await db.execute({
    sql: last == null
      ? "INSERT INTO meta (key, value) VALUES ('event_log_day', ?) ON CONFLICT(key) DO NOTHING"
      : "UPDATE meta SET value = ? WHERE key = 'event_log_day' AND value = ?",
    args: last == null ? [today] : [today, last],
  });

  if (claim.rowsAffected !== 1) return null;
  const yesterday = dayOf(now - DAY);
  const report = await buildReport(yesterday, now);

  await db.execute({
    sql: "INSERT INTO meta (key, value) VALUES ('event_log_last_report', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: [JSON.stringify(report)],
  });
  // The first day after logging was switched on has nothing to tell.
  if (report.totals.events > 0) {
    const text = reportText(report);

    for (const id of await adminIds().catch(() => [] as number[])) {
      await tg("sendMessage", { chat_id: id, parse_mode: "HTML", text }).catch(() => {});
    }
  }
  const [startOfToday] = dayRange(today);
  const del = await db.execute({ sql: "DELETE FROM event_log WHERE at < ?", args: [startOfToday] });

  logEvent("log.purge", { day: yesterday, deleted: del.rowsAffected, verdict: report.verdict, findings: report.findings.length }, { at: now });

  return { day: yesterday, deleted: del.rowsAffected, verdict: report.verdict };
}

/** The last nightly report kept by dailyLogJobs (the day's events are gone by then). */
export async function lastReport(): Promise<DayReport | null> {
  const db = await getDb();
  const rs = await db.execute("SELECT value FROM meta WHERE key = 'event_log_last_report'");

  return rs.rows[0] ? (JSON.parse(String(rs.rows[0].value)) as DayReport) : null;
}

