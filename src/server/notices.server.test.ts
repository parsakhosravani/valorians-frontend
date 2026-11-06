import "@/server/testing/harness";
import { describe, expect, test } from "bun:test";

import { newPlayer, reload } from "@/server/testing/harness";
import { NOTICES_KEPT, listNotices, markNoticesRead, noticePulse, unreadNotices } from "@/server/notices";
import { GET as pulseRoute } from "@/app/api/notices/pulse/route";
import { NextRequest } from "next/server";
import { notify } from "@/server/notify";
import { playerView } from "@/server/players";

describe("in-game notices", () => {
  test("the pulse tells an open game when something new arrived, and needs a sign-in", async () => {
    const now = Date.now();
    const p = await newPlayer(now);

    expect(await noticePulse(p.id)).toEqual({ newest: 0, unread: 0 });
    await notify.defended(p.id, "Raider", { attackerLosses: {}, defenderLosses: {} } as never).catch(() => {});
    const a = await noticePulse(p.id);

    expect(a.newest).toBeGreaterThan(0);
    expect(a.unread).toBe(1);
    await markNoticesRead(p.id, a.newest);
    expect(await noticePulse(p.id)).toEqual({ newest: a.newest, unread: 0 });
    // Another player's notices don't show in yours.
    const q = await newPlayer(now);

    expect((await noticePulse(q.id)).newest).toBe(0);
    const res = await pulseRoute(new NextRequest("http://x/api/notices/pulse"));

    expect(res.status).toBe(401);
  });

  test("a bot notification also lands in the game's inbox, even with no bot", async () => {
    const now = Date.now();
    const p = await newPlayer(now);

    await notify.spyCaught(p.id, "Parsa");
    const [n] = await listNotices(p.id);

    expect(n.html).toContain("Watchtower caught a spy");
    expect(n.html).toContain("Parsa");
    expect(n.path).toBe("/battle?tab=map");
    expect(n.read).toBe(false);
    expect((await playerView(await reload(p.id), now)).me.unreadNotices).toBe(1);
  });

  test("reading marks up to the newest seen, and the inbox stays short", async () => {
    const p = await newPlayer(Date.now());

    for (let i = 0; i < NOTICES_KEPT + 5; i++) await notify.lairEmpty(p.id);
    const all = await listNotices(p.id);

    expect(all.length).toBe(NOTICES_KEPT);
    await markNoticesRead(p.id, all[1].id);
    expect(await unreadNotices(p.id)).toBe(1);
    await markNoticesRead(p.id, all[0].id);
    expect(await unreadNotices(p.id)).toBe(0);
  });
});
