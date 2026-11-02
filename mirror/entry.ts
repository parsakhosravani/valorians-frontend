/**
 * The mirror's whole backend, bundled into tgcloud/lib/valorians.js by build.ts.
 * The same src/server + src/app/api code the Vercel app runs; this file only
 * adapts Telegram Serverless calls to it:
 *
 *   endpoints/api.js   → callRoute()   (every /api/<path> the Mini App uses)
 *   handlers/*.js      → botUpdate()   (the bot's webhook, /api/bot on Vercel)
 *   endpoints/cron.js  → runCron()     (the GitHub Action sweep on Vercel)
 *   endpoints/setup.js → runSetup()    (/api/bot/setup on Vercel)
 */
import "./shims/runtime";

import { makeRequest, runAfterTasks } from "./shims/next-server";
import { routes } from "./.build/routes";

import { handleUpdate, setupBot } from "@/server/bot";
import { maybeCheckRelease } from "@/server/announce";
import { getDb } from "@/server/db";
import { GET as cronGet } from "@/app/api/cron/battles/route";

type InitData = { user?: { id: number }; start_param?: string };
type Call = { path?: string; method?: string; query?: string; body?: unknown };
type Out = { status: number; body: unknown };

/** How often the cron work runs, piggybacking on players' requests (no scheduler on Serverless). */
const CRON_EVERY_MS = 60_000;

/**
 * Runs the cron work (battles, trades, new tribes on the map, ranks,
 * announcements) when it hasn't run for a minute. The claim is a compare-and-
 * set on the meta table, so two requests at once don't both run it.
 */
async function maybeCron(now = Date.now()) {
  const db = await getDb();
  const rs = await db.execute("SELECT value FROM meta WHERE key = 'mirror_cron_at'");
  const last = rs.rows[0] ? String(rs.rows[0].value) : null;

  if (last !== null && now - Number(last) < CRON_EVERY_MS) return;
  const claim = last === null
    ? await db.execute({ sql: "INSERT OR IGNORE INTO meta (key, value) VALUES ('mirror_cron_at', ?)", args: [String(now)] })
    : await db.execute({ sql: "UPDATE meta SET value = ? WHERE key = 'mirror_cron_at' AND value = ?", args: [String(now), last] });

  if (!claim.rowsAffected) return;
  await runCron();
}

export async function runCron(): Promise<Out> {
  const res = await cronGet(makeRequest({ method: "GET", path: "cron/battles", query: "", body: null, headers: {} }) as any);

  return { status: res.status, body: await res.json() };
}

/** One Mini App request, e.g. { path: "war/march", method: "POST", body: {...} }. */
export async function callRoute(input: Call, initData: InitData): Promise<Out> {
  const path = String(input?.path ?? "").replace(/^\/+|\/+$/g, "");
  const method = input?.method === "POST" ? "POST" : "GET";
  const mod = (routes as Record<string, any>)[path];
  const fn = mod?.[method];

  if (!fn) return { status: 404, body: { error: "Not found", code: "not_found" } };
  if (!initData?.user) return { status: 401, body: { error: "Unauthorized", code: "unauthorized" } };
  const header = `tgcloud ${JSON.stringify({ user: initData.user, startParam: initData.start_param })}`;
  const req = makeRequest({
    method,
    path,
    query: String(input?.query ?? ""),
    body: method === "POST" ? (input?.body ?? {}) : null,
    headers: { authorization: header },
  });
  const res = await fn(req, { params: Promise.resolve({}) });
  const body = await res.json().catch(() => null);

  // Next would run these after answering; the isolate may stop once we return.
  await runAfterTasks();
  await maybeCron().catch((e) => console.error("mirror cron failed", e));

  return { status: res.status, body };
}

/** One bot update (message, callback_query, pre_checkout_query). */
export async function botUpdate(update: unknown) {
  try {
    await handleUpdate(update as any);
    await maybeCheckRelease();
  } catch (e) {
    console.error("bot update failed", e);
  }
}

/**
 * Bot profile texts, command menu and the Play button (setupBot), for admins
 * only. The webhook part is a no-op here: the platform owns the webhook.
 */
export async function runSetup(initData: InitData) {
  const admins = String(process.env.BOT_ADMIN_IDS ?? "").split(",").map((s) => Number(s.trim())).filter(Boolean);

  if (!initData?.user || !admins.includes(initData.user.id)) return { ok: false, error: "admins only (BOT_ADMIN_IDS)" };

  return setupBot();
}

export const routeNames = Object.keys(routes);
