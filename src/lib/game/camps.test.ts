import { test, expect } from "bun:test";

import * as E from "./engine";
import * as W from "./war";
import { CAMP_STEEP_UNTIL, campDefense, campFirstReward, campName } from "./config";
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

test("rewards past camp 30 grow in a straight line, slower than the barbarians", () => {
  const r30 = campFirstReward(30).resources;

  expect(campFirstReward(40).resources / r30).toBeCloseTo(1.4, 2);
  expect(campFirstReward(60).resources / r30).toBeCloseTo(2.2, 2);
  // Each step pays less than the camp gets tougher.
  for (let level = CAMP_STEEP_UNTIL + 1; level < 80; level++) {
    const d = campDefense(level + 1) / campDefense(level);
    const r = campFirstReward(level + 1).resources / campFirstReward(level).resources;

    expect(r).toBeLessThan(d);
  }
});

test("camps have names, the same each time, and neighbours differ", () => {
  expect(campName(7)).toBe(campName(7));
  expect(campName(5)).toMatch(/ Camp$/);
  expect(campName(15)).toMatch(/ Hold$/);
  expect(campName(25)).toMatch(/ Fortress$/);
  expect(campName(45)).toMatch(/ Citadel$/);
  for (let level = 1; level < 100; level++) expect(campName(level)).not.toBe(campName(level + 1));
  // No two camps share a name within a tier.
  expect(new Set(Array.from({ length: 10 }, (_, i) => campName(i + 1))).size).toBe(10);
});

test("only your newest beaten camps can be raided again", () => {
  const s = E.createInitialState(0);
  s.camps.cleared = 30;
  s.army.spearman = 10;
  const now = 10 * 60 * 60 * 1000;

  // The newest 3 beaten camps and the next one stay.
  for (const level of [28, 29, 30, 31]) expect(W.campGone(s, level)).toBe(false);
  expect(() => W.dispatchCamp(s, 28, { spearman: 1 } as never, now)).not.toThrow();
  // Older ones are gone.
  expect(W.campGone(s, 27)).toBe(true);
  expect(W.campGone(s, 1)).toBe(true);
  expect(() => W.dispatchCamp(s, 27, { spearman: 1 } as never, now)).toThrow("moved on");
  expect(() => W.checkCamp(s, 5, now)).toThrow("moved on");
});
