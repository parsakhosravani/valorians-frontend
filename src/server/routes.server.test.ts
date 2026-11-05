import "@/server/testing/harness";
import { afterEach, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

import { callRoute, newPlayer, reload } from "@/server/testing/harness";
import { GET as health } from "@/app/api/health/route";
import { POST as cancelBuild } from "@/app/api/buildings/cancel/route";
import { POST as finishBuild } from "@/app/api/buildings/finish/route";
import { POST as master } from "@/app/api/buildings/master/route";
import { POST as upgrade } from "@/app/api/buildings/upgrade/route";
import { POST as exchange } from "@/app/api/trade/exchange/route";
import { POST as found } from "@/app/api/outposts/found/route";
import { POST as raiseField } from "@/app/api/outposts/upgrade/route";
import { POST as wonder } from "@/app/api/clan/wonder/route";
import { GET as leaderboard } from "@/app/api/leaderboard/route";
import { leaderboard as board } from "@/server/war";
import { mutatePlayer } from "@/server/players";
import { maybeRefreshRanks } from "@/server/ranks";
import { proxy } from "@/proxy";
import { webAppUrl } from "@/server/appUrl";
import type { GameState } from "@/lib/game/engine";

/**
 * The API as the app calls it: every Valorians 2 route, signed in, with good
 * and bad input. Errors must come back as 400 { error, code }, never a 500.
 */
const lateGame = (s: GameState) => {
  for (const k of Object.keys(s.buildings)) s.buildings[k] = 12;
  // Within every building's top, or the save migration refunds the extra levels into the stores.
  Object.assign(s.buildings, {
    "town-hall": 20, "resource-warehouse": 20, barracks: 5, stable: 10, "siege-workshop": 5,
    "exploration-center": 1, academy: 10, "dragon-roost": 0, arsenal: 20, "trading-post": 10,
  });
  for (const r of ["iron", "wood", "clay", "crop"] as const) s.resources[r] = 600_000;
  s.population = 10_000;
};

const expectRefusal = (r: { status: number; json: any }) => {
  expect(r.status).toBe(400);
  expect(typeof r.json.error).toBe("string");
  expect(typeof r.json.code).toBe("string");
};

describe("API routes (server)", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env.MAINTENANCE = env.MAINTENANCE;
    process.env.LAUNCHER_URL = env.LAUNCHER_URL;
  });

  test("health answers 200 with CORS and no cache, and 503 in maintenance", async () => {
    const ok = await health();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe("*");
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect((await ok.json()).ok).toBe(true);
    process.env.MAINTENANCE = "on";
    const down = await health();
    expect(down.status).toBe(503);
    expect((await down.json()).reason).toBe("maintenance");
  });

  test("build, cancel, finish and master through the API", async () => {
    const T0 = Date.now();
    const p = await newPlayer(T0, lateGame);
    const started = await callRoute(upgrade, p.id, { building: "armory" });
    expect(started.status).toBe(200);
    const cancelled = await callRoute(cancelBuild, p.id, { building: "armory" });
    expect(cancelled.status).toBe(200);
    expect((await reload(p.id)).state.queue.length).toBe(0);
    expectRefusal(await callRoute(cancelBuild, p.id, { building: "armory" })); // nothing to cancel
    expectRefusal(await callRoute(finishBuild, p.id, { building: "armory" }));
    expect((await callRoute(master, p.id, { building: "arsenal" })).status).toBe(200);
    expect((await reload(p.id)).state.queue[0]).toMatchObject({ building: "arsenal", mastery: true });
    for (const junk of [{}, { building: "__proto__" }, { building: 7 }, { building: "castle" }]) {
      expectRefusal(await callRoute(upgrade, p.id, junk));
      expectRefusal(await callRoute(master, p.id, junk));
    }
  });

  test("the Merchant of the North and its refusals", async () => {
    const p = await newPlayer(Date.now(), lateGame);
    const before = (await reload(p.id)).state.resources;
    const swapped = await callRoute(exchange, p.id, { give: "iron", want: "wood", amount: 1000 });
    expect(swapped.json.error ?? null).toBeNull();
    expect(swapped.status).toBe(200);
    const after = (await reload(p.id)).state.resources;
    expect(after.iron).toBeLessThan(before.iron);
    expect(after.wood).toBeGreaterThan(before.wood);
    for (const junk of [{}, { give: "iron", want: "iron", amount: 100 }, { give: "gold", want: "iron", amount: 100 }, { give: "iron", want: "wood", amount: -5 }]) {
      expectRefusal(await callRoute(exchange, p.id, junk));
    }
  });

  test("outposts: found one, raise a field, refuse junk", async () => {
    const p = await newPlayer(Date.now(), lateGame);
    expect((await callRoute(found, p.id, {})).status).toBe(200);
    expect((await callRoute(raiseField, p.id, { outpost: 0, resource: "iron" })).status).toBe(200);
    expectRefusal(await callRoute(raiseField, p.id, { outpost: 0, resource: "wood" })); // its builder is busy
    expectRefusal(await callRoute(raiseField, p.id, { outpost: 5, resource: "iron" }));
    expectRefusal(await callRoute(raiseField, p.id, { outpost: "x", resource: "toString" }));
  });

  test("the Wonder needs a clan; the leaderboard opens on power", async () => {
    const p = await newPlayer(Date.now());
    expectRefusal(await callRoute(wonder, p.id, {}));
    const board = await callRoute(leaderboard as never, p.id);
    expect(board.status).toBe(200);
    expect(board.json.metric).toBe("power");
  });

  test("maintenance: screens show the maintenance page, the API says why, the bot keeps answering", () => {
    const req = (path: string) => new NextRequest(`http://test.local${path}`);
    delete process.env.MAINTENANCE;
    expect(proxy(req("/hall")).headers.get("x-middleware-next")).toBe("1");
    process.env.MAINTENANCE = "on";
    expect(proxy(req("/hall")).headers.get("x-middleware-rewrite")).toContain("/maintenance");
    expect(proxy(req("/api/tap")).status).toBe(503);
    expect(proxy(req("/api/bot")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(req("/api/health")).headers.get("x-middleware-next")).toBe("1");
  });

  test("Telegram buttons go through the launcher when there is one", () => {
    delete process.env.LAUNCHER_URL;
    expect(webAppUrl("/clan")).toMatch(/\/clan$/);
    process.env.LAUNCHER_URL = "https://example.github.io/valorians/";
    expect(webAppUrl()).toBe("https://example.github.io/valorians/");
    expect(webAppUrl("/clan")).toBe("https://example.github.io/valorians/?to=%2Fclan");
  });

  test("the leaderboard is in the order of the power it shows, even between rank passes", async () => {
    const T0 = Date.now();
    const a = await newPlayer(T0);
    await maybeRefreshRanks(T0 + 10 * 60_000);
    // A big jump in power right after a rank pass: the stored rank is now behind.
    await mutatePlayer(a.id, T0, (s) => {
      lateGame(s);
      s.army.knight = 5_000;

      return s;
    });
    const b = await board(await reload(a.id), "power");
    const values = b.top.map((r) => r.value);

    expect(values).toEqual([...values].sort((x, y) => y - x));
    expect(b.top.map((r) => r.rank)).toEqual(b.top.map((_, i) => i + 1));
    const me = b.top.find((r) => r.isMe);
    if (me) expect(b.me.rank).toBe(me.rank);
  });
});
