import "@/server/testing/harness";
import { describe, expect, test } from "bun:test";

import { newPlayer, reload } from "@/server/testing/harness";
import { NOTICES_KEPT, listNotices, markNoticesRead, unreadNotices } from "@/server/notices";
import { notify } from "@/server/notify";
import { playerView } from "@/server/players";

describe("in-game notices", () => {
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
