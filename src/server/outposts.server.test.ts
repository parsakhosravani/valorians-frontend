import "@/server/testing/harness";
import { describe, expect, test } from "bun:test";

import { newPlayer, reload } from "@/server/testing/harness";
import { getDb } from "@/server/db";
import { homeOf, mapView } from "@/server/map";
import { bringHome, candidates, moveOutpostsOutOfWalls, offeredSpots, settleOutpost, stationTroops } from "@/server/outposts";
import { advance, emptyArmy } from "@/lib/game/engine";
import { outpostLand } from "@/lib/game/outpost";
import { mutatePlayer } from "@/server/players";
import { OUTPOST } from "@/lib/game/config";
import { distance, pickHomeSite, seaRoute, terrainAt } from "@/lib/game/map";

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

  test("a tribe hemmed in by neighbours still finds land for an outpost", async () => {
    const home = await homeOf((await newPlayer(Date.now())).id);
    // Neighbours packed all round, every few tiles across the whole outpost ring.
    const crowd: { x: number; y: number }[] = [home];
    const R = OUTPOST.maxDistance + OUTPOST.clearOfVillages;

    for (let dy = -R; dy <= R; dy += 6)
      for (let dx = -R; dx <= R; dx += 6) if (dx || dy) crowd.push({ x: home.x + dx, y: home.y + dy });
    const spots = candidates(home, new Set(crowd.map((p) => `${p.x},${p.y}`)), crowd);

    expect(spots.length).toBeGreaterThan(0);
    for (const p of spots) {
      expect(distance(p, home)).toBeLessThanOrEqual(OUTPOST.farthestDistance);
      // Packed this tight, it settles for the minimum: still past every wall.
      for (const v of crowd.slice(1)) expect(distance(p, v)).toBeGreaterThanOrEqual(OUTPOST.clearOfVillagesMin);
    }
  });

  test("in a crowded world, the oldest tribes in the middle still find land for all their outposts", () => {
    // A world settled the way the game settles it (pickHomeSite), 800 tribes. The oldest sit in its
    // crowded middle: before clearOfVillagesLast, a third of them had no land for their outposts.
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const homes: { x: number; y: number }[] = [];

    for (let i = 0; i < 800; i++) {
      const p = pickHomeSite(homes, rand);

      if (!p) break;
      homes.push(p);
    }
    const outposts: { x: number; y: number }[] = [];
    let stuck = 0;

    for (const home of homes.slice(0, 40)) {
      for (let k = 0; k < OUTPOST.hallLevels.length; k++) {
        const taken = new Set([...homes, ...outposts].map((p) => `${p.x},${p.y}`));
        const spots = candidates(home, taken, homes, outposts);

        if (!spots.length) {
          stuck++;
          break;
        }
        for (const v of homes) if (v !== home) expect(distance(spots[0], v)).toBeGreaterThanOrEqual(OUTPOST.clearOfVillagesLast);
        outposts.push(spots[0]);
      }
    }
    expect(stuck).toBe(0);
  });

  test("outposts keep clear of other outposts, not just their tile", async () => {
    const home = await homeOf((await newPlayer(Date.now())).id);
    const first = candidates(home, new Set())[0];
    const spots = candidates(home, new Set([`${first.x},${first.y}`]), [home], [first]);

    expect(spots.length).toBeGreaterThan(0);
    for (const p of spots) expect(distance(p, first)).toBeGreaterThanOrEqual(OUTPOST.clearOfOutposts);
  });

  test("an outpost never stands inside another tribe's walls", async () => {
    const home = await homeOf((await newPlayer(Date.now())).id);
    // A neighbour just past the outpost ring's nearest edge, where the closest spots would be.
    const near = candidates(home, new Set())[0];
    const neighbour = { x: home.x + Math.sign(near.x - home.x) * 7, y: home.y + Math.sign(near.y - home.y) * 7 };
    const spots = candidates(home, new Set(), [home, neighbour]);

    expect(spots.length).toBeGreaterThan(0);
    for (const p of spots) expect(distance(p, neighbour)).toBeGreaterThanOrEqual(OUTPOST.clearOfVillages);
    // Without the neighbour, the nearest spots would have been right by it.
    expect(candidates(home, new Set()).some((p) => distance(p, neighbour) < OUTPOST.clearOfVillages)).toBe(true);
  });

  test("outposts already inside a neighbour's walls move out, keeping their fields", async () => {
    const T0 = Date.now();
    const me = await newPlayer(T0, ready);
    const them = await newPlayer(T0);
    const home = await homeOf(me.id);
    const theirs = await homeOf(them.id);
    const db = await getDb();
    // As the old placement allowed: an outpost a tile from their village.
    const bad = { x: theirs.x + 1, y: theirs.y };

    await db.execute({ sql: "DELETE FROM outposts WHERE x = ? AND y = ?", args: [bad.x, bad.y] });
    await db.execute({ sql: "INSERT INTO outposts (user_id, idx, x, y) VALUES (?, 0, ?, ?)", args: [me.id, bad.x, bad.y] });
    await mutatePlayer(me.id, T0, (s) => {
      s.outposts = [{ x: bad.x, y: bad.y, foundedAt: T0, fields: { iron: 3, wood: 2, clay: 1, crop: 4 } }];

      return s;
    });
    await db.execute("DELETE FROM meta WHERE key = 'outposts_clear_v2'");

    expect(await moveOutpostsOutOfWalls()).toBeGreaterThanOrEqual(1);
    const o = (await reload(me.id)).state.outposts[0];
    const row = (await db.execute({ sql: "SELECT x, y FROM outposts WHERE user_id = ? AND idx = 0", args: [me.id] })).rows[0];

    expect({ x: Number(row.x), y: Number(row.y) }).toEqual({ x: o.x, y: o.y });
    expect(distance(o, theirs)).toBeGreaterThanOrEqual(OUTPOST.clearOfVillages);
    expect(distance(o, home)).toBeLessThanOrEqual(OUTPOST.maxDistance);
    expect(o.fields).toEqual({ iron: 3, wood: 2, clay: 1, crop: 4 });
    expect(o.land).toEqual(outpostLand(o.x, o.y));
    // Once only.
    expect(await moveOutpostsOutOfWalls()).toBe(0);
  });

  test("an outpost with troops on it or on the way waits to be moved", async () => {
    const T0 = Date.now();
    const me = await newPlayer(T0, ready);
    const them = await newPlayer(T0);
    await homeOf(me.id);
    const theirs = await homeOf(them.id);
    const db = await getDb();
    const bad = { x: theirs.x, y: theirs.y + 2 };

    await db.execute({ sql: "DELETE FROM outposts WHERE x = ? AND y = ?", args: [bad.x, bad.y] });
    await db.execute({ sql: "INSERT INTO outposts (user_id, idx, x, y) VALUES (?, 0, ?, ?)", args: [me.id, bad.x, bad.y] });
    await mutatePlayer(me.id, T0, (s) => {
      s.outposts = [{ x: bad.x, y: bad.y, foundedAt: T0, fields: { iron: 1, wood: 1, clay: 1, crop: 1 }, land: outpostLand(bad.x, bad.y), garrison: { ...emptyArmy(), spearman: 10 } }];

      return s;
    });
    await db.execute("DELETE FROM meta WHERE key = 'outposts_clear_v2'");

    await moveOutpostsOutOfWalls();
    expect((await reload(me.id)).state.outposts[0]).toMatchObject(bad);
    // Not marked done: it moves once its garrison has gone.
    expect((await db.execute("SELECT 1 FROM meta WHERE key = 'outposts_clear_v2'")).rows.length).toBe(0);
    await mutatePlayer(me.id, T0, (s) => {
      s.outposts[0].garrison = emptyArmy();

      return s;
    });
    await moveOutpostsOutOfWalls();
    const o = (await reload(me.id)).state.outposts[0];
    expect(distance(o, theirs)).toBeGreaterThanOrEqual(OUTPOST.clearOfVillagesMin);
    expect(o.garrison ?? emptyArmy()).toEqual(emptyArmy());
  });

  test("the player picks the land: offered spots can be settled, others refused", async () => {
    const T0 = Date.now();
    const me = await newPlayer(T0, ready);
    const home = await homeOf(me.id);
    const spots = await offeredSpots(me);

    expect(spots.length).toBeGreaterThan(0);
    for (const p of spots) {
      expect(p.land).toEqual(outpostLand(p.x, p.y));
      expect(distance(home, p)).toBeGreaterThanOrEqual(OUTPOST.minDistance);
    }
    // Not a spot it could settle: refused, nothing paid, no tile claimed.
    await expect(settleOutpost(me, T0, { x: home.x, y: home.y })).rejects.toThrow("can't be settled");
    expect((await reload(me.id)).state.outposts.length).toBe(0);

    const pick = spots[spots.length - 1];
    const after = await settleOutpost(await reload(me.id), T0 + 1, pick);
    expect(after.state.outposts[0]).toMatchObject({ x: pick.x, y: pick.y, land: pick.land });
    // The spot is gone from the next offer.
    expect((await offeredSpots(await reload(me.id))).some((p) => p.x === pick.x && p.y === pick.y)).toBe(false);
  });

  test("a claim left behind by a crashed founding doesn't block the tribe forever", async () => {
    const T0 = Date.now();
    const me = await newPlayer(T0, ready);
    const home = await homeOf(me.id);
    const db = await getDb();

    // The request claimed tile #0 and died before saving the outpost (timeout, crash): the row stays.
    await db.execute({ sql: "INSERT INTO outposts (user_id, idx, x, y) VALUES (?, 0, ?, ?)", args: [me.id, home.x + 900, home.y + 900] });
    const after = await settleOutpost(await reload(me.id), T0 + 120_000);

    expect(after.state.outposts.length).toBe(1);
    const rows = await db.execute({ sql: "SELECT x, y FROM outposts WHERE user_id = ?", args: [me.id] });
    expect(rows.rows.map((r) => `${r.x},${r.y}`)).toEqual([`${after.state.outposts[0].x},${after.state.outposts[0].y}`]);
  });
});

describe("garrisons (server)", () => {
  test("troops march to an outpost over land and back home", async () => {
    const T0 = Date.now();
    const p = await newPlayer(T0, (s) => {
      s.army.axeman = 300;
    });
    const home = await homeOf(p.id);
    let spot: { x: number; y: number } | null = null;

    for (let r = 5; r <= 9 && !spot; r++)
      for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r]]) {
        const t = { x: home.x + dx, y: home.y + dy };

        if (!["sea", "lake", "mountains"].includes(terrainAt(t.x, t.y)) && !seaRoute(home, t, { ...emptyArmy(), axeman: 1 }).naval) {
          spot = t;
          break;
        }
      }
    if (!spot) return; // an island start: nothing to check here
    const at = spot;

    await mutatePlayer(p.id, T0, (s) => {
      s.outposts = [{ x: at.x, y: at.y, foundedAt: T0, fields: { iron: 0, wood: 0, clay: 0, crop: 0 }, land: { resource: "iron", percent: 0 } }];
      return s;
    });
    const sent = await stationTroops(await reload(p.id), 0, { ...emptyArmy(), axeman: 120 }, T0);
    const m = sent.state.marches[0];

    expect(m.to).toBe(0);
    expect(sent.state.army.axeman).toBe(180);
    const there = await reload(p.id);
    const arrived = advance(there.state, m.returnsAt + 1);

    expect(arrived.outposts[0].garrison?.axeman).toBe(120);
    await mutatePlayer(p.id, m.returnsAt + 1, (s) => s);
    const back = await bringHome(await reload(p.id), 0, { ...emptyArmy(), axeman: 20 }, m.returnsAt + 2);

    expect(back.state.outposts[0].garrison?.axeman).toBe(100);
    expect(back.state.marches.some((x) => x.to == null && x.units.axeman === 20)).toBe(true);
  });
});
