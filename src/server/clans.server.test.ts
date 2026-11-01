import "@/server/testing/harness";
import { describe, expect, test } from "bun:test";

import { newPlayer, reload } from "@/server/testing/harness";
import { getDb } from "@/server/db";
import { createClan, joinClan, leaveClan } from "@/server/clans";
import { CLAN } from "@/lib/game/config";

let n = 0;
const uniqueName = () => `Wolves ${Date.now() % 100000}${n++}`;

async function clan(id: number) {
  const db = await getDb();

  return (await db.execute({ sql: "SELECT * FROM clans WHERE id = ?", args: [id] })).rows[0];
}

describe("clans (server)", () => {
  test("founding costs coins and makes you the leader", async () => {
    const T0 = Date.now();
    const p = await newPlayer(T0);
    const coins = p.state.coins;
    const after = await createClan(p, { name: uniqueName(), tag: "WOLF" }, T0);

    expect(after.clanId).not.toBeNull();
    expect(after.state.coins).toBeCloseTo(coins - CLAN.createCost, 5);
    expect(Number((await clan(after.clanId!)).leader_id)).toBe(p.id);
  });

  test("when the leader leaves, the longest-serving member takes over", async () => {
    const T0 = Date.now();
    const leader = await createClan(await newPlayer(T0), { name: uniqueName(), tag: "OLD" }, T0);
    const id = leader.clanId!;
    const first = await newPlayer(T0);
    const second = await newPlayer(T0);

    await joinClan(first, { id }, T0 + 1000);
    await joinClan(second, { id }, T0 + 2000);
    await leaveClan(await reload(leader.id), T0 + 3000);

    expect(Number((await clan(id)).leader_id)).toBe(first.id);
    expect((await reload(leader.id)).clanId).toBeNull();
  });

  test("the last member out disbands the clan", async () => {
    const T0 = Date.now();
    const leader = await createClan(await newPlayer(T0), { name: uniqueName(), tag: "LAST" }, T0);

    await leaveClan(leader, T0 + 1000);
    expect(await clan(leader.clanId!)).toBeUndefined();
  });

  test("you can't found a clan without the coins", async () => {
    const T0 = Date.now();
    const poor = await newPlayer(T0, (s) => {
      s.coins = 0;
    });

    await expect(createClan(poor, { name: uniqueName(), tag: "POOR" }, T0)).rejects.toThrow();
    expect((await reload(poor.id)).clanId).toBeNull();
  });
});
