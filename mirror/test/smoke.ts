#!/usr/bin/env bun
/**
 * Runs the built mirror backend (tgcloud/lib/valorians.js) against a fake
 * Telegram Serverless SDK: SQLite in memory for `db`, a recorder for `api`.
 * Catches what typecheck can't: shims missing something the server uses.
 *
 *   bun mirror/build.ts backend && bun mirror/test/smoke.ts
 */
import { Database } from "bun:sqlite";
import { plugin } from "bun";
import path from "path";

const sqlite = new Database(":memory:");
const botCalls: Array<{ method: string; params: any }> = [];

class BotApiError extends Error {
  constructor(
    public code: number,
    public description: string
  ) {
    super(description);
  }
}

const isWrite = (q: string) => !/^\s*(SELECT|WITH|PRAGMA)\b/i.test(q) || /\bRETURNING\b/i.test(q);

const fakeDb = {
  async run(q: string, params: Record<string, unknown> = {}) {
    const st = sqlite.query(q);

    if (/\bRETURNING\b/i.test(q)) {
      const rows = st.all(params as any) as any[];

      return { rows, rowsAffected: rows.length, lastInsertRowid: rows.length ? Number((rows[0] as any).id ?? 0) : 0 };
    }
    const r = st.run(params as any);

    return { rows: [], rowsAffected: r.changes, lastInsertRowid: Number(r.lastInsertRowid) };
  },
  async all(q: string, params: Record<string, unknown> = {}) {
    if (isWrite(q)) throw new Error(`all() given a write: ${q}`);

    return sqlite.query(q).all(params as any);
  },
};

const fakeApi = new Proxy(
  {},
  {
    get: (_t, method: string) => async (params: any) => {
      botCalls.push({ method, params });
      if (method === "getMe") return { id: 42, username: "mirror_bot" };
      if (method === "createInvoiceLink") return "https://t.me/$invoice";
      if (method === "getChatMember") throw new BotApiError(400, "chat not found");

      return true;
    },
  }
);

plugin({
  name: "fake-sdk",
  setup(build) {
    build.module("sdk", () => ({
      exports: {
        db: fakeDb,
        api: fakeApi,
        BotApiError,
        fetch: async (url: string) => {
          throw new Error(`unexpected outbound fetch in test: ${url}`);
        },
      },
      loader: "object",
    }));
  },
});

// The isolate has no global fetch; make sure nothing relies on Bun's.
(globalThis as any).fetch = undefined;

const mirror = await import(path.join(import.meta.dir, "../tgcloud/lib/valorians.js"));

let failed = 0;
const user = (id: number) => ({ user: { id, first_name: `Tester${id}`, username: `t${id}` } });

async function call(id: number, p: string, body?: object, query = "") {
  const out = await mirror.callRoute({ path: p, method: body ? "POST" : "GET", body, query }, user(id));

  return out as { status: number; body: any };
}

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}\n       ${(e as Error).stack?.split("\n").slice(0, 4).join("\n       ")}`);
  }
}

function expect(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

console.log(`routes: ${mirror.routeNames.length}`);

await check("me creates a player", async () => {
  const r = await call(1, "me");

  expect(r.status === 200, `status ${r.status} ${JSON.stringify(r.body)}`);
  expect(r.body?.me?.id === 1 && r.body?.state, "no player view");
});
await check("second player", async () => {
  const r = await call(2, "me");

  expect(r.status === 200, `status ${r.status} ${JSON.stringify(r.body)}`);
});
await check("unknown route → 404", async () => {
  expect((await call(1, "nope")).status === 404, "expected 404");
});
await check("no user → 401", async () => {
  const r = await mirror.callRoute({ path: "me" }, {});

  expect(r.status === 401, `status ${r.status}`);
});
await check("tap (POST, body)", async () => {
  const r = await call(1, "tap", { resource: "wood", taps: 5, crits: 0, comboSum: 0, frenzyTaps: 0 });

  expect(r.status === 200 || r.status === 400, `status ${r.status} ${JSON.stringify(r.body)}`);
});
await check("game errors come back as 400 + code", async () => {
  const r = await call(1, "buildings/upgrade", { id: "no-such-building" });

  expect(r.status === 400 && r.body?.code, `got ${r.status} ${JSON.stringify(r.body)}`);
});
await check("leaderboard (GET with query)", async () => {
  const r = await call(1, "leaderboard", undefined, "by=population");

  expect(r.status === 200, `status ${r.status} ${JSON.stringify(r.body)}`);
});
await check("war map", async () => {
  const r = await call(1, "war/map");

  expect(r.status === 200, `status ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
});
await check("war reports", async () => {
  expect((await call(1, "war/reports")).status === 200, "status");
});
await check("clan list", async () => {
  const r = await call(1, "clan");

  expect(r.status === 200, `status ${r.status} ${JSON.stringify(r.body)}`);
});
await check("clan create (insert id) reaches the game rules", async () => {
  const r = await call(2, "clan/create", { name: "Mirror Wolves", tag: "MW" });

  // A fresh tribe may not afford a clan yet: a 400 GameError is fine, a 500 is not.
  expect(r.status === 200 || r.status === 400, `status ${r.status} ${JSON.stringify(r.body)}`);
});
await check("march to a barbarian camp (random rolls, insert id)", async () => {
  const r = await call(1, "war/march", { camp: 1, units: { swordsman: 1 } });

  expect(r.status === 200 || r.status === 400, `status ${r.status} ${JSON.stringify(r.body)}`);
});
await check("market", async () => {
  const r = await call(1, "trade");

  expect(r.status === 200, `status ${r.status} ${JSON.stringify(r.body)}`);
});
await check("streak", async () => {
  const r = await call(1, "streak");

  expect(r.status < 500, `status ${r.status} ${JSON.stringify(r.body)}`);
});
await check("plus invoice goes through the bot api", async () => {
  const before = botCalls.length;
  const r = await call(1, "plus/invoice", {});

  expect(r.status < 500, `status ${r.status} ${JSON.stringify(r.body)}`);
  if (r.status === 200) expect(botCalls.slice(before).some((c) => c.method === "createInvoiceLink"), "no createInvoiceLink");
});
await check("cron runs", async () => {
  const r = await mirror.runCron();

  expect(r.status === 200 && r.body?.ok, `got ${JSON.stringify(r)}`);
  expect(!botCalls.some((c) => c.method === "setWebhook"), "the game must not set the webhook");
});
await check("bot /start replies", async () => {
  const before = botCalls.length;

  await mirror.botUpdate({
    update_id: 1,
    message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, from: { id: 1, is_bot: false, first_name: "A" }, text: "/start" },
  });
  const sent = botCalls.slice(before).map((c) => c.method);

  expect(sent.length > 0, "bot sent nothing");
  console.log(`       bot called: ${sent.join(", ")}`);
});
await check("tables were created by db.ts", async () => {
  const names = (sqlite.query("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map((r) => r.name);

  for (const t of ["users", "battles", "attacks", "clans", "trades", "meta"]) expect(names.includes(t), `missing ${t}`);
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
