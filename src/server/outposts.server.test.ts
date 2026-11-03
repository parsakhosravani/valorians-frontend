import "@/server/testing/harness";
import { describe, expect, test } from "bun:test";

import { newPlayer, reload } from "@/server/testing/harness";
import { getDb } from "@/server/db";
import { homeOf, mapView } from "@/server/map";
import { settleOutpost } from "@/server/outposts";
import { OUTPOST } from "@/lib/game/config";
import { distance, terrainAt } from "@/lib/game/map";

const ready = (s: Parameters<NonNullable<Parameters<typeof newPlayer>[1]>>[0]) => {
  s.buildings["town-hall"] = 20;
  s.buildings["resource-warehouse"] = 20;
  for (const r of ["iron", "wood", "clay", "crop"] as const) s.resources[r] = 500_000;
  s.population = 10_000;
};

describe("outposts (server)", () => {
  test("an outpost settles on free dry land near home, one tile each, and shows on the map", async () => {
    const T0 = Date.now();
    const me = await newPlayer(T0, ready);
    const home = await homeOf(me.id);
    const after = await settleOutpost(me, T0);
    const o = after.state.outposts[0];
    const d = distance(home, o);

    expect(d).toBeGreaterThanOrEqual(OUTPOST.minDistance);
    expect(d).toBeLessThanOrEqual(OUTPOST.maxDistance);
    expect(["sea", "lake", "mountains"]).not.toContain(terrainAt(o.x, o.y));
    const db = await getDb();
    const rows = await db.execute({ sql: "SELECT x, y FROM outposts WHERE user_id = ?", args: [me.id] });
    expect(rows.rows.map((r) => ({ x: Number(r.x), y: Number(r.y) }))).toEqual([{ x: o.x, y: o.y }]);

    // A second and third take other tiles; a fourth is refused.
    const two = await settleOutpost(await reload(me.id), T0 + 1);
    const three = await settleOutpost(await reload(me.id), T0 + 2);
    const tiles = new Set(three.state.outposts.map((p) => `${p.x},${p.y}`));
    expect(tiles.size).toBe(3);
    expect(two.state.outposts.length).toBe(2);
    await expect(settleOutpost(await reload(me.id), T0 + 3)).rejects.toThrow();

    const view = await mapView(await reload(me.id), T0 + 4);
    expect(view.outposts.filter((p) => p.isMe).length).toBe(3);
  });

  test("a tribe that can't pay leaves no claimed tile behind", async () => {
    const T0 = Date.now();
    const poor = await newPlayer(T0, (s) => {
      ready(s);
      s.population = 0;
    });

    await expect(settleOutpost(poor, T0)).rejects.toThrow("people");
    const db = await getDb();
    const rows = await db.execute({ sql: "SELECT COUNT(*) AS n FROM outposts WHERE user_id = ?", args: [poor.id] });
    expect(Number(rows.rows[0].n)).toBe(0);
  });
});
