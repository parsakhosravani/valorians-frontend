import { test, expect } from "bun:test";

import * as E from "./engine";
import * as W from "./war";
import { CAMP_STEEP_UNTIL, campDefense, campFirstReward } from "./config";
import { CAMP_REACH, campPositions, distance, homeSlot } from "./map";

const T0 = Date.UTC(2026, 9, 31, 12);

test("camps 1–30 keep their old numbers", () => {
  for (const level of [1, 10, 29, 30]) {
    expect(campDefense(level)).toBe(Math.round(80 * Math.pow(1.35, level - 1)));
    expect(campFirstReward(level).resources).toBe(Math.round(400 * Math.pow(1.3, level - 1)));
  }
});

test("camps past 30 keep coming, each a gentle step up", () => {
  for (let level = CAMP_STEEP_UNTIL; level < 80; level++) {
    const d = campDefense(level + 1) / campDefense(level);
    const r = campFirstReward(level + 1).resources / campFirstReward(level).resources;

    expect(d).toBeGreaterThan(1);
    expect(level === CAMP_STEEP_UNTIL || d < 1.13).toBe(true);
    expect(level === CAMP_STEEP_UNTIL || r < 1.11).toBe(true);
  }
  // Camp 40 is a few times camp 30, not twenty.
  expect(campDefense(40) / campDefense(30)).toBeLessThan(4);
});

test("after beating camp 30, camp 31 is the next one and can be attacked", () => {
  const s = E.createInitialState(T0);

  s.camps.cleared = 30;
  expect(W.campStatus(s, 31, T0).state).toBe("new");
  expect(W.campStatus(s, 32, T0).state).toBe("locked");
  expect(() => W.checkCamp(s, 31, T0)).not.toThrow();
  expect(() => W.checkCamp(s, 32, T0)).toThrow();
});

test("camps past 30 stay about as far as camp 30, never on top of another", () => {
  const home = homeSlot(4);
  const camps = campPositions(42, home, 60);
  const far = distance(home, camps[CAMP_STEEP_UNTIL - 1]);
  const keys = new Set(camps.map((p) => `${p.x},${p.y}`));

  expect(keys.size).toBe(camps.length);
  for (const p of camps.slice(CAMP_STEEP_UNTIL)) expect(distance(home, p)).toBeLessThanOrEqual(Math.max(far + 4, CAMP_REACH(CAMP_STEEP_UNTIL)));
});

test("camps 1–30 sit where they always did", () => {
  const home = homeSlot(9);

  expect(campPositions(7, home, 60).slice(0, 30)).toEqual(campPositions(7, home, 30));
});
