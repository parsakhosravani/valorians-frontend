import { expect, test } from "bun:test";

import * as B from "./bandits";
import * as E from "./engine";
import * as W from "./war";
import { BANDIT, banditStrength, banditTheft, lairBounty } from "./config";
import { MarchRoute, Point, TERRAIN, terrainAt } from "./map";

const T0 = Date.UTC(2026, 9, 28, 10);

/** A straight road along y from x0 to x1, all on land. */
const road = (x0: number, x1: number, y: number): MarchRoute => {
  const path: Point[] = [];

  for (let x = x0; x <= x1; x++) path.push({ x, y });

  return {
    path,
    wet: path.map(() => false),
    steps: path.slice(1).map(() => [1, 0] as [number, number]),
    land: path.length - 1,
    sea: 0,
    naval: false,
    length: path.length - 1,
    distance: path.length - 1,
    detour: false,
    climbed: false,
  };
};

const army = (n: Partial<E.Army>) => ({ ...E.emptyArmy(), ...n });

/** A few real lairs near the middle of the world. */
const someLairs = () => B.lairsIn({ x: 0, y: 0 }, { x: 120, y: 120 }, []);

test("lairs sit on walkable land inside their square, the same every time", () => {
  const lairs = someLairs();

  expect(lairs.length).toBeGreaterThan(40);
  for (const l of lairs) {
    const t = terrainAt(l.x, l.y);

    expect(t).not.toBe("sea");
    expect(TERRAIN[t].march).not.toBeNull();
    expect(l.level).toBeGreaterThanOrEqual(1);
    expect(l.level).toBeLessThanOrEqual(BANDIT.maxLevel);
    const again = B.lairOfCell(Math.floor(l.x / BANDIT.cell), Math.floor(l.y / BANDIT.cell));

    expect(again).toEqual(l);
  }
  // Some strongholds among the small gangs.
  expect(new Set(lairs.map((l) => l.level)).size).toBeGreaterThan(2);
});

test("lairs keep away from villages", () => {
  const l = someLairs()[0];
  const near = { x: l.x + 1, y: l.y + 1 };
  const far = { x: l.x + 5, y: l.y };

  expect(B.lairsIn(l, l, [near])).toEqual([]);
  expect(B.lairsIn(l, l, [far])).toEqual([l]);
});

test("a road passing close to a lair is exposed, one going past at a distance isn't", () => {
  const lair = { x: 50, y: 50, level: 2 };
  const close = B.lairsOnRoute(road(44, 56, 51), [lair], null);

  expect(close.length).toBe(1);
  // Passed halfway along the road.
  expect(close[0].f).toBeCloseTo(0.5, 1);
  expect(B.lairsOnRoute(road(44, 56, 53), [lair], null)).toEqual([]);
  // Out at sea, bandits can't reach the road.
  const wet = road(44, 56, 51);

  wet.wet = wet.wet.map((_, k) => k > 0 && k < wet.path.length - 1);
  expect(B.lairsOnRoute(wet, [lair], null)).toEqual([]);
});

test("the lair you march on doesn't ambush you on the way there", () => {
  const lair = { x: 56, y: 51, level: 1 };

  expect(B.lairsOnRoute(road(44, 56, 51), [lair], null)).toEqual([]);
});

test("lairs are met in the order the road passes them", () => {
  const a = { x: 47, y: 50, level: 1 };
  const b = { x: 53, y: 50, level: 3 };
  const met = B.lairsOnRoute(road(44, 56, 51), [b, a], null);

  expect(met.map((m) => m.lair)).toEqual([a, b]);
});

test("guarded merchants are never robbed; others lose a share of the load", () => {
  const exposed = [{ lair: { x: 50, y: 50, level: 2 }, f: 0.5 }];
  const trip = { startedAt: T0, endsAt: T0 + 60_000 };

  expect(B.rollRobbery(exposed, 1000, true, trip, () => 0)).toBeNull();
  expect(B.rollRobbery(exposed, 1000, false, trip, () => 0.99)).toBeNull();
  const r = B.rollRobbery(exposed, 1000, false, trip, () => 0)!;

  expect(r.stolen).toBe(Math.floor(1000 * banditTheft(2)));
  expect(r.at).toBe(T0 + 30_000);
});

test("bandits leave a strong army alone", () => {
  const s = E.createInitialState(T0);
  const units = army({ swordsman: 200 }); // 6,000 attack vs a level 1 lair
  const exposed = [{ lair: { x: 50, y: 50, level: 1 }, f: 0.5 }];

  expect(B.rollAmbush(s, units, exposed, { startedAt: T0, endsAt: T0 + 1000 }, () => 0)).toBeNull();
});

test("an ambush kills some of a small army and the survivors march on", () => {
  const s = E.createInitialState(T0);
  const units = army({ swordsman: 10, longship: 2 });
  const exposed = [{ lair: { x: 50, y: 50, level: 3 }, f: 0.25 }];
  // They strike (0 < chance), with average luck (0.5).
  const rolls = [0, 0.5];
  const a = B.rollAmbush(s, units, exposed, { startedAt: T0, endsAt: T0 + 4000 }, () => rolls.shift()!)!;

  expect(a).not.toBeNull();
  expect(a.won).toBe(false); // 300 attack vs 486
  expect(a.at).toBe(T0 + 1000);
  expect(a.lost.swordsman).toBeGreaterThan(0);
  expect(a.lost.longship).toBe(0); // ships aren't lost on land
  const left = B.afterAmbush(units, a);

  expect(left.swordsman).toBeGreaterThanOrEqual(3); // never more than 70% die
  expect(left.longship).toBe(2);
});

test("winning an ambush costs little, losing one costs a lot", () => {
  expect(B.ambushLosses(1000, 500)).toBeLessThan(0.15);
  expect(B.ambushLosses(500, 500)).toBeCloseTo(0.3);
  expect(B.ambushLosses(100, 500)).toBeCloseTo(0.62);
  expect(B.ambushLosses(0, 500)).toBe(0.7);
});

test("bandits who win take half the spoils an army carries", () => {
  const base = { x: 0, y: 0, level: 1, at: T0, lost: E.emptyArmy(), attack: 1, strength: 2, luck: 1 };
  const lost = B.spoilsTaken({ ...base, won: false }, { iron: 100, wood: 51, clay: 0, crop: 0 }, 41);

  expect(lost.taken.iron).toBe(50);
  expect(lost.left.wood).toBe(26);
  expect(lost.coinsTaken).toBe(20);
  const won = B.spoilsTaken({ ...base, won: true }, { iron: 100, wood: 0, clay: 0, crop: 0 }, 40);

  expect(won.taken.iron).toBe(0);
  expect(won.coinsLeft).toBe(40);
});

test("a cleared lair is empty until the bandits come back", () => {
  expect(B.lairActive(null, T0)).toBe(true);
  expect(B.lairActive(T0, T0 + 1000)).toBe(false);
  expect(B.lairActive(T0, T0 + BANDIT.respawnMs)).toBe(true);
  // An ambush planned before the lair was cleared still happens if it's due first.
  expect(B.lairActive(T0, T0 - 1)).toBe(true);
});

test("clearing a lair brings home its hoard; camps are untouched and your shield stays", () => {
  const s0 = E.createInitialState(T0);

  s0.buildings.barracks = 2;
  s0.army.swordsman = 40;
  s0.shieldUntil = T0 + 3600_000;
  const d = W.dispatchLair(s0, army({ swordsman: 40 }));

  expect(d.state.shieldUntil).toBe(T0 + 3600_000);
  expect(d.state.army.swordsman).toBe(0);
  const { state, report } = W.lairBattle(d.state, 2, d.sent, T0, 0.5, { travelMs: 60_000 });

  expect(report.attackerWon).toBe(true);
  expect(report.defense).toBe(banditStrength(2));
  expect(report.loot.iron).toBe(lairBounty(2).resources);
  expect(report.coins).toBe(lairBounty(2).coins);
  expect(state.camps.cleared).toBe(s0.camps.cleared);
  expect(state.marches[0].target).toBe("Bandit lair");
});
