import { expect, test } from "bun:test";

import * as E from "./engine";
import * as W from "./war";
import { LANDING_DEFENSE, MAP_MAX, MAP_MIN, MAP_SIZE, UNIT_BY_ID } from "./config";
import {
  Point,
  campPosition,
  homeSlot,
  pickHomeSite,
  resettleSpot,
  siteScore,
  HOME_SPACING,
  HOME_NEAR,
  isCoastal,
  marchMs,
  routeMs,
  seaAt,
  seaRoute,
  shipsNeeded,
  terrainAt,
} from "./map";

const T0 = Date.UTC(2026, 9, 26, 10);
const army = (a: Partial<E.Army>) => ({ ...E.emptyArmy(), ...a });

/** A pair of land tiles with open sea between them and no sensible way round on foot. */
function acrossTheSea(): { a: Point; b: Point } {
  for (let y = 0; y < 120; y++) {
    for (let x = 0; x < 120; x++) {
      if (seaAt(x, y) || !seaAt(x + 1, y)) continue;
      for (let k = 3; k < 12; k++) {
        if (seaAt(x + k, y)) continue;
        const b = { x: x + k, y };
        if (seaRoute({ x, y }, b).naval) return { a: { x, y }, b };
      }
    }
  }
  throw new Error("no sea near the middle of the map");
}

/** Two land tiles with only land between them. */
function overLand(): { a: Point; b: Point } {
  for (let y = 40; y < 80; y++) {
    for (let x = 40; x < 80; x++) {
      const a = { x, y };
      const b = { x: x + 5, y };
      if (terrainAt(a.x, a.y) !== "sea" && terrainAt(b.x, b.y) !== "sea" && !seaRoute(a, b).naval) return { a, b };
    }
  }
  throw new Error("no land near the middle of the map");
}

test("the world is the real North: much of it sea, the heart of the map land, with water near the first tribes", () => {
  let wet = 0;
  for (let y = MAP_MIN; y < MAP_MAX; y++) for (let x = MAP_MIN; x < MAP_MAX; x++) if (seaAt(x, y)) wet++;
  const share = wet / (MAP_SIZE * MAP_SIZE);
  // The North Sea, the Norwegian Sea and the Baltic: a little over half the map.
  expect(share).toBeGreaterThan(0.4);
  expect(share).toBeLessThan(0.65);
  expect(seaAt(60, 60)).toBe(false);
  // Something to sail across within reach of the first tribes.
  let near = 0;
  for (let y = 30; y < 90; y++) for (let x = 30; x < 90; x++) if (seaAt(x, y)) near++;
  expect(near).toBeGreaterThan(20);
});

test("new tribes never settle in the sea", () => {
  for (let n = 0; n < 500; n++) {
    const p = homeSlot(n);
    expect(terrainAt(p.x, p.y)).not.toBe("sea");
  }
});

test("a road over water is a sea route; over land it isn't", () => {
  const sea = acrossTheSea();
  const r = seaRoute(sea.a, sea.b);
  expect(r.naval).toBe(true);
  expect(r.sea).toBeGreaterThan(0);
  // The road is never shorter than the straight line.
  expect(r.sea + r.land).toBeGreaterThanOrEqual(r.distance - 1e-9);
  expect(isCoastal(sea.a)).toBe(true);

  const land = overLand();
  expect(seaRoute(land.a, land.b).naval).toBe(false);
});

test("barbarian camps prefer land you can walk to", () => {
  let walkable = 0;
  for (let id = 1; id <= 40; id++) {
    const home = homeSlot(id);
    for (let level = 1; level <= 3; level++) if (!seaRoute(home, campPosition(id, level, home)).naval) walkable++;
  }
  expect(walkable / 120).toBeGreaterThan(0.95);
});

test("ships: one per 20 foot, horsemen take two places, siege four", () => {
  expect(shipsNeeded(army({ spearman: 20 }))).toBe(1);
  expect(shipsNeeded(army({ spearman: 21 }))).toBe(2);
  expect(shipsNeeded(army({ cavalry: 10 }))).toBe(1);
  expect(shipsNeeded(army({ ram: 5, spearman: 1 }))).toBe(2);
  expect(shipsNeeded(army({ longship: 9 }))).toBe(0);
});

test("embark: needs a harbor and enough ships, takes exactly what's needed", () => {
  const s = E.createInitialState(T0);
  s.army.swordsman = 30;
  expect(() => W.embark(s, army({ swordsman: 30 }), true)).toThrow("Build a Harbor");
  s.buildings.harbor = 1;
  s.army.longship = 1;
  expect(() => W.embark(s, army({ swordsman: 30 }), true)).toThrow("takes 2 Longships");
  s.army.longship = 5;
  expect(W.embark(s, army({ swordsman: 30 }), true).longship).toBe(2);
  // Over land the ships stay home.
  expect(W.embark(s, army({ swordsman: 30, longship: 3 }), false).longship).toBe(0);
  // Ships alone are not an army.
  expect(() => W.dispatchRaid(s, army({ longship: 2 }), T0)).toThrow("Choose some troops");
});

test("sea travel goes at sailing speed; walking speed only on land", () => {
  const sea = acrossTheSea();
  const units = army({ ram: 4, longship: 1 });
  const r = seaRoute(sea.a, sea.b);
  const expected = (r.land * UNIT_BY_ID.ram.speed + r.sea * UNIT_BY_ID.longship.speed) * 1000;
  expect(routeMs(units, sea.a, sea.b)).toBe(Math.round(Math.max(20_000, expected)));
  // Over land it's all walking: rough ground counts extra, so never quicker than the straight line.
  const land = overLand();
  const lr = seaRoute(land.a, land.b);
  expect(routeMs(units, land.a, land.b)).toBe(Math.round(lr.land * UNIT_BY_ID.ram.speed * 1000));
  expect(routeMs(units, land.a, land.b)).toBeGreaterThanOrEqual(marchMs(units, lr.distance));
});

test("landing from the sea: defenders fight better, harbor adds more, ships never die", () => {
  const atk = E.createInitialState(T0);
  atk.buildings.barracks = 2;
  atk.buildings.harbor = 1;
  atk.army.swordsman = 200;
  atk.army.longship = 10;
  const def = E.createInitialState(T0);
  def.shieldUntil = 0;
  def.army.spearman = 60;
  def.army.longship = 4;

  const sent = W.embark(atk, army({ swordsman: 200 }), true);
  const plain = W.battleNumbers(atk, sent, def, "plains");
  const beach = W.battleNumbers(atk, sent, def, "plains", 0, true);
  expect(beach.attack).toBe(plain.attack);
  expect(beach.defense / plain.defense).toBeCloseTo(1 + LANDING_DEFENSE);

  def.buildings.harbor = 5;
  const harbored = W.battleNumbers(atk, sent, def, "plains", 0, true);
  expect(harbored.defense / W.battleNumbers(atk, sent, def, "plains").defense).toBeCloseTo(1 + LANDING_DEFENSE + 0.15);
  expect(W.landingFactorFor(5)).toBeCloseTo(1 + LANDING_DEFENSE + 0.15);

  const { report, state } = W.defendRaid(def, atk, sent, T0, 0.5, { landing: true });
  expect(report.attackerLosses.longship).toBe(0);
  expect(report.defenderLosses.longship).toBe(0);
  expect(state.army.longship).toBe(4);
  // The ships sail the survivors home.
  const home = W.receiveRaidReport(atk, report, "them", T0, 0.3);
  expect(home.marches[0].units.longship).toBe(sent.longship);
});

test("ships carry loot home", () => {
  const atk = E.createInitialState(T0);
  atk.army.axeman = 40;
  atk.army.longship = 2;
  const def = E.createInitialState(T0);
  def.shieldUntil = 0;
  def.resources = { iron: 14000, wood: 14000, clay: 14000, crop: 14000 };
  const withShips = W.defendRaid(def, atk, army({ axeman: 40, longship: 2 }), T0, 0.9, { landing: true }).report;
  const without = W.defendRaid(def, atk, army({ axeman: 40 }), T0, 0.9).report;
  const total = (l: Record<string, number>) => Object.values(l).reduce((a, b) => a + b, 0);
  expect(withShips.attackerWon).toBe(true);
  expect(total(withShips.loot)).toBeGreaterThan(total(without.loot));
});

test("new tribes settle at random, by the shore first, spaced out and near the others", () => {
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const taken: Point[] = [];
  let coastal = 0;

  for (let n = 0; n < 150; n++) {
    const p = pickHomeSite(taken, rand);

    expect(p).not.toBeNull();
    const t = terrainAt(p!.x, p!.y);
    expect(t).not.toBe("sea");
    expect(t).not.toBe("lake");
    expect(t).not.toBe("mountains");
    for (const q of taken) expect(Math.hypot(p!.x - q.x, p!.y - q.y)).toBeGreaterThanOrEqual(HOME_SPACING);
    if (taken.length) expect(Math.min(...taken.map((q) => Math.hypot(p!.x - q.x, p!.y - q.y)))).toBeLessThanOrEqual(HOME_NEAR + 1);
    if (isCoastal(p!) || siteScore(p!) > 1.6) coastal++;
    taken.push(p!);
  }
  // Not a grid: spots don't line up every few tiles.
  const xs = new Set(taken.map((p) => p.x % 4));
  expect(xs.size).toBe(4);
  // The shore draws settlers: well over a third settle by water.
  expect(coastal / taken.length).toBeGreaterThan(0.35);
});

test("villages already on the map move a little, to good land, and stay neighbours", () => {
  let seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // The old grid: every 4 tiles round the middle, wherever the world put them.
  const old: Point[] = [];
  for (let y = 40; y <= 80; y += 4) for (let x = 40; x <= 80; x += 4) old.push({ x, y });
  const placed: Point[] = [];
  let wetBefore = 0;

  for (const p of old) {
    const t = terrainAt(p.x, p.y);
    if (t === "sea" || t === "lake" || t === "mountains") wetBefore++;
    const others = [...placed, ...old.slice(placed.length + 1)];
    const to = resettleSpot(p, others, rand);
    const tt = terrainAt(to.x, to.y);

    // Never farther than it has to: a few tiles on land, a shore within reach from the water.
    expect(Math.hypot(to.x - p.x, to.y - p.y)).toBeLessThanOrEqual(t === "sea" || t === "lake" || t === "mountains" ? 18 : 4);
    if (!(to.x === p.x && to.y === p.y)) {
      expect(["sea", "lake", "mountains"]).not.toContain(tt);
      for (const q of placed) expect(Math.hypot(to.x - q.x, to.y - q.y)).toBeGreaterThanOrEqual(3);
    }
    placed.push(to);
  }
  // Off the water and mountains wherever there was land near.
  const stuck = placed.filter((p) => ["sea", "lake", "mountains"].includes(terrainAt(p.x, p.y))).length;
  expect(stuck).toBeLessThan(Math.max(1, wetBefore / 3));
});
