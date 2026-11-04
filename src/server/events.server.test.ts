import "@/server/testing/harness";
import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

import { callRoute, newPlayer } from "@/server/testing/harness";
import { POST as upgrade } from "@/app/api/buildings/upgrade/route";
import { GET as reportRoute } from "@/app/api/admin/report/route";
import { GET as eventsRoute } from "@/app/api/admin/events/route";
import { getDb } from "@/server/db";
import { dayOf, dayRange, flushEvents, logEvent, stateChange } from "@/server/events";
import { buildReport, dailyLogJobs, listEvents } from "@/server/eventReport";
import { createInitialState } from "@/lib/game/engine";

/** The event log: every move is written, the nightly report finds broken flows, each day is deleted. */
describe("event log (server)", () => {
  test("an API move logs the call and what the save changed", async () => {
    const p = await newPlayer(Date.now(), (s) => {
      for (const r of ["iron", "wood", "clay", "crop"] as const) s.resources[r] = 50_000;
    });
    const ok = await callRoute(upgrade, p.id, { building: "sawmill" });
    const no = await callRoute(upgrade, p.id, { building: "castle" });

    expect(ok.status).toBe(200);
    expect(no.status).toBe(400);
    await flushEvents();
    const mine = await listEvents({ playerId: p.id });
    const calls = mine.filter((e) => e.kind === "api");
    const saves = mine.filter((e) => e.kind === "save");

    expect(calls.map((e) => e.data.status).sort()).toEqual([200, 400]);
    expect(calls.find((e) => e.data.status === 400)).toMatchObject({ level: "warn", data: { body: { building: "castle" } } });
    // The upgrade's cost shows up in its save, under the same route.
    const paid = saves.find((e) => e.data.queue === 1)!;

    expect(paid).toBeDefined();
    expect(paid.ctx).toBe(calls[0].ctx);
    expect(Object.values(paid.data.res as Record<string, number>).every((d) => d < 0)).toBe(true);
  });

  test("a save with negative or NaN numbers is flagged as a bug", () => {
    const a = createInitialState(0);
    const b = structuredClone(a);

    b.resources.iron = -5;
    b.coins = NaN;
    const change = stateChange(a, b);

    expect(change.bad).toEqual(expect.arrayContaining(["resources.iron=-5", "coins=NaN"]));
    expect(stateChange(a, structuredClone(a))).toEqual({});
  });

  test("the report finds crashes, bad saves and stuck trades; a quiet day is ok", async () => {
    // A day far in the past, so other tests' events don't mix in.
    const day = "2001-02-03";
    const [from] = dayRange(day);

    expect(dayOf(from)).toBe(day);
    expect(dayOf(from - 1)).toBe("2001-02-02");
    expect((await buildReport(day, from + 20 * 60_000)).verdict).toBe("ok");
    // A whole day without one cron run is a bug: battles only fight when someone is online.
    expect((await buildReport(day, from + 3_600_000)).findings.map((f) => f.check)).toContain("cron_silent");

    logEvent("cron.run", { ms: 10 }, { at: from + 60_000 });
    logEvent("api", { method: "POST", path: "/api/war/raid", status: 500, code: "server_error", ms: 40, error: "boom" }, { at: from + 120_000, level: "error", playerId: 1 });
    logEvent("save", { res: { iron: -10 }, bad: ["resources.iron=-3"] }, { at: from + 130_000, level: "error", playerId: 1 });
    logEvent("war.begin", { id: 77, endsAt: from + 200_000 }, { at: from + 150_000, playerId: 1 });
    const r = await buildReport(day, from + 86_000_000);
    const checks = r.findings.map((f) => f.check);

    expect(r.verdict).toBe("bugs");
    expect(checks).toEqual(expect.arrayContaining(["api_crash", "bad_numbers", "battle_never_finished", "cron_gap"]));
    expect(r.routes["POST /api/war/raid"]).toMatchObject({ calls: 1, crashed: 1 });
  });

  test("once a day the previous day is reported and deleted, and only once", async () => {
    const db = await getDb();
    const now = Date.parse("2030-06-10T09:00:00Z");
    const [today] = dayRange(dayOf(now));

    logEvent("cron.run", {}, { at: today - 3_600_000 }); // yesterday
    logEvent("cron.run", {}, { at: today + 60_000 }); // today
    await flushEvents();
    await db.execute({ sql: "INSERT INTO meta (key, value) VALUES ('event_log_day', '2030-06-09') ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [] });
    const first = await dailyLogJobs(now);

    expect(first).toMatchObject({ day: "2030-06-09" });
    expect(first!.deleted).toBeGreaterThanOrEqual(1);
    expect(await dailyLogJobs(now + 60_000)).toBeNull();
    const left = await db.execute({ sql: "SELECT COUNT(*) AS n FROM event_log WHERE at < ?", args: [today] });

    expect(Number(left.rows[0].n)).toBe(0);
    const kept = await listEvents({ from: today, to: today + 120_000, kind: "cron.run" });

    expect(kept.length).toBe(1);
  });

  test("reading the log needs the key", async () => {
    const req = (url: string, auth?: string) => new NextRequest(url, { headers: auth ? { authorization: auth } : {} });
    const saved = process.env.EVENT_LOG_KEY;

    delete process.env.EVENT_LOG_KEY;
    const cron = process.env.CRON_SECRET;

    delete process.env.CRON_SECRET;
    expect((await reportRoute(req("http://t.local/api/admin/report"))).status).toBe(401); // no key set: closed
    process.env.EVENT_LOG_KEY = "k3y";
    expect((await eventsRoute(req("http://t.local/api/admin/events?key=nope"))).status).toBe(401);
    expect((await eventsRoute(req("http://t.local/api/admin/events?key=k3y&limit=5"))).status).toBe(200);
    expect((await reportRoute(req("http://t.local/api/admin/report?day=2001-02-03", "Bearer k3y"))).status).toBe(200);
    expect((await reportRoute(req("http://t.local/api/admin/report?day=junk", "Bearer k3y"))).status).toBe(400);
    process.env.EVENT_LOG_KEY = saved;
    process.env.CRON_SECRET = cron;
    if (saved === undefined) delete process.env.EVENT_LOG_KEY;
    if (cron === undefined) delete process.env.CRON_SECRET;
  });
});
