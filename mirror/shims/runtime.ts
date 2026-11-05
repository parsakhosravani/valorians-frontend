/**
 * Global `fetch` for the mirror bundle. Telegram Serverless runs our code in a
 * bare V8 isolate, not Node: there is no global fetch, only the SDK's.
 *
 * Bot API calls: the game calls `https://api.telegram.org/bot<token>/<method>`
 * with fetch. On Serverless there is no token in our hands; instead the SDK's
 * `api` is already signed in as the bot. So such URLs are answered by `api`.
 */
import { api, fetch as sdkFetch } from "sdk";

const g = globalThis as any;

// process.env, timers, AbortSignal.timeout and Response come from prelude.js,
// which build.ts puts above everything else in the bundle.

const BOT_URL = /\/bot[^/]+\/([A-Za-z]+)(?:\?(.*))?$/;

/** What the bot sees as its webhook: the platform owns it, so it always looks "up to date". */
const fakeWebhookInfo = () => ({
  url: `${String(g.process.env.APP_URL || "").replace(/\/$/, "")}/api/bot`,
  allowed_updates: ["message", "callback_query", "pre_checkout_query"],
  pending_update_count: 0,
});

function parseQuery(q: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const part of q.split("&")) {
    if (!part) continue;
    const [k, v = ""] = part.split("=");

    out[decodeURIComponent(k.replace(/\+/g, " "))] = decodeURIComponent(v.replace(/\+/g, " "));
  }

  return out;
}

const jsonResponse = (data: unknown, status = 200) =>
  new g.Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

async function botApi(method: string, params: Record<string, unknown>) {
  // The platform sets the webhook from our handlers/; never let the game move it.
  if (method === "setWebhook" || method === "deleteWebhook") return { ok: true, result: true };
  if (method === "getWebhookInfo") return { ok: true, result: fakeWebhookInfo() };
  try {
    return { ok: true, result: await (api as any)[method](params) };
  } catch (e: any) {
    if (e && typeof e.code === "number") {
      return { ok: false, error_code: e.code, description: e.description ?? e.message, parameters: e.parameters };
    }

    return { ok: false, description: e?.message ?? String(e) };
  }
}

g.fetch = async (input: any, init: any = {}) => {
  const url = typeof input === "string" ? input : String(input?.url ?? input);

  if (url.startsWith("https://api.telegram.org/bot") || url.startsWith("tgcloud://bot")) {
    const m = BOT_URL.exec(url);

    if (!m) return jsonResponse({ ok: false, description: "bad Bot API url" }, 400);
    let params: Record<string, unknown> = m[2] ? parseQuery(m[2]) : {};

    if (typeof init.body === "string" && init.body) params = { ...params, ...JSON.parse(init.body) };

    return jsonResponse(await botApi(m[1], params));
  }
  // Next.js-only and AbortSignal options mean nothing to the SDK's fetch.
  const { cache: _c, signal: _s, next: _n, ...rest } = init;

  return sdkFetch(url, rest);
};

/** Placeholder so `TELEGRAM_API_BASE` routes through the fetch above. */
export const MIRROR_RUNTIME = true;
