import "@/server/testing/harness";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { newPlayer, reload } from "@/server/testing/harness";
import { homeOf } from "@/server/map";
import { listNotices } from "@/server/notices";
import { playerView } from "@/server/players";
import { plantSpy, spiesSeeMarch, sweepSpies } from "@/server/spies";
import { SPY } from "@/lib/game/config";
import { emptyArmy } from "@/lib/game/engine";

/** A new player already placed on the map (placing uses Math.random, which the tests rig). */
const placed = async (...args: Parameters<typeof newPlayer>) => {
  const p = await newPlayer(...args);

  await homeOf(p.id);

  return p;
};
const spyMaster = (now: number, ec = 1) =>
  placed(now, (s) => {
    s.buildings["exploration-center"] = ec;
    s.coins = 100_000;
  }, "Spymaster");
const village = (now: number, watchtower: number) =>
  placed(now, (s) => {
    s.buildings["watchtower"] = watchtower;
    s.coins = 10_000;
  }, "Villager");
/** Every catch roll fails (0.999) or succeeds (0). */
const dice = (v: number) => spyOn(Math, "random").mockReturnValue(v);

describe("spies and Watchtowers (server)", () => {
  afterEach(() => mock.restore());

  test("a Watchtower only counts spies from SPY.seeLevel", async () => {
    const now = Date.now();
    const low = await village(now, SPY.seeLevel - 1);
    const high = await village(now, SPY.seeLevel);
    const [a, b] = [await spyMaster(now), await spyMaster(now)];

    dice(0.999);
    await plantSpy(a, low.id, now);
    await plantSpy(b, high.id, now);
    expect((await playerView(await reload(low.id), now)).me.spiesInside).toBeNull();
    expect((await playerView(await reload(high.id), now)).me.spiesInside).toBe(1);
  });

  test("a spy caught slipping out sends no report and is gone", async () => {
    const now = Date.now();
    const target = await village(now, SPY.seeLevel);
    const watcher = await spyMaster(now);

    dice(0.999);
    await plantSpy(watcher, target.id, now);
    dice(0);
    await spiesSeeMarch(await reload(target.id), emptyArmy(), 60_000, now + 1);

    const theirs = await listNotices(watcher.id);

    expect(theirs.some((n) => n.html.includes("was caught"))).toBe(true);
    expect(theirs.some((n) => n.html.includes("army just marched out"))).toBe(false);
    expect((await listNotices(target.id)).some((n) => n.html.includes("Spymaster"))).toBe(true);
    expect((await playerView(await reload(target.id), now + 2)).me.spiesInside).toBe(0);
  });

  test("an uncaught spy reports the march", async () => {
    const now = Date.now();
    const target = await village(now, 1);
    const watcher = await spyMaster(now);

    dice(0.999);
    await plantSpy(watcher, target.id, now);
    await spiesSeeMarch(await reload(target.id), emptyArmy(), 60_000, now + 1);
    expect((await listNotices(watcher.id)).some((n) => n.html.includes("army just marched out"))).toBe(true);
  });

  test("a sweep costs coins and catches spies; an empty village costs nothing", async () => {
    const now = Date.now();
    const target = await village(now, SPY.seeLevel);
    const watcher = await spyMaster(now);

    await expect(sweepSpies(target, now)).rejects.toThrow("no spies");
    expect((await reload(target.id)).state.coins).toBe(10_000);

    dice(0.999);
    await plantSpy(watcher, target.id, now);
    dice(0);
    const { sweep } = await sweepSpies(await reload(target.id), now + 1);

    expect(sweep.caught).toEqual([watcher.firstName]);
    expect(sweep.left).toBe(0);
    expect((await reload(target.id)).state.coins).toBeCloseTo(10_000 - SPY.sweepCost, 0);
  });

  test("a low Watchtower can't sweep", async () => {
    const now = Date.now();

    await expect(sweepSpies(await village(now, SPY.seeLevel - 1), now)).rejects.toThrow("needs level");
  });
});
