import "@/server/testing/harness";
import { describe, expect, test } from "bun:test";

import { callRoute, newPlayer, reload } from "@/server/testing/harness";
import { mutatePlayer } from "@/server/players";
import { POST as upgrade } from "@/app/api/buildings/upgrade/route";
import { POST as tap } from "@/app/api/tap/route";

describe("saving a player under parallel requests", () => {
  test("parallel changes are all kept, none lost", async () => {
    const T0 = Date.now();
    const p = await newPlayer(T0);
    const start = (await reload(p.id)).state.coins;

    // Twenty requests for one player at once: taps, map refreshes, and battles and trades
    // landing on them from other players. With retries all at once this used to give up at ten.
    const n = 20;
    const results = await Promise.allSettled(
      Array.from({ length: n }, () =>
        mutatePlayer(p.id, T0, (s) => {
          s.coins += 1;

          return s;
        })
      )
    );

    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    expect((await reload(p.id)).state.coins).toBe(start + n);
  });

  test("a double-tap on Upgrade starts the building once and pays once", async () => {
    const T0 = Date.now();
    const p = await newPlayer(T0);
    const before = (await reload(p.id)).state.resources.wood;

    const [a, b] = await Promise.all([
      callRoute(upgrade, p.id, { building: "iron-mine" }),
      callRoute(upgrade, p.id, { building: "iron-mine" }),
    ]);
    const statuses = [a.status, b.status].sort();
    const saved = (await reload(p.id)).state;

    // One goes through; the other is told the builder is busy (one builder at the start).
    expect(statuses).toEqual([200, 400]);
    expect(saved.queue.length).toBe(1);
    const paid = Math.round(before - saved.resources.wood);
    const single = Math.round(before - (await newPlayerUpgradedOnce(T0)).resources.wood);

    expect(paid).toBe(single);
  });

  test("tap batches sent in parallel are capped together, not each on their own", async () => {
    const T0 = Date.now();
    const p = await newPlayer(T0);
    const before = (await reload(p.id)).state;

    // Two batches of 1,000 taps at once: the speed cap must apply to both together.
    await Promise.all([callRoute(tap, p.id, { resource: "iron", taps: 1000 }), callRoute(tap, p.id, { resource: "iron", taps: 1000 })]);
    const after = (await reload(p.id)).state;
    const spent = before.energy - after.energy;

    // At most the burst allowance (40 taps) plus a moment of tapping — nowhere near 2,000.
    expect(spent / 10).toBeLessThan(100);
  });

  test("a request without sign-in is refused", async () => {
    process.env.NEXT_PUBLIC_DEV_LOGIN = "true";
    const { NextRequest } = await import("next/server");
    const res = await upgrade(new NextRequest("http://test.local/api", { method: "POST", body: "{}" }));

    expect(res.status).toBe(401);
  });
});

async function newPlayerUpgradedOnce(now: number) {
  const p = await newPlayer(now);

  await callRoute(upgrade, p.id, { building: "iron-mine" });

  return (await reload(p.id)).state;
}
