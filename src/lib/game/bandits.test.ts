import { expect, test } from "bun:test";

import * as B from "./bandits";
import * as E from "./engine";
import * as W from "./war";
import { BANDIT, banditStrength, banditTheft, lairBounty } from "./config";
import * as C from "./config";
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

// ─── Raids on villages ───────────────────────────────────────────────────────

test("bandit raids gather only from a manned lair near an unshielded village, at most once a day", () => {
  const s = E.createInitialState(T0);
  s.shieldUntil = 0;
  s.army.spearman = 200;
  const home = { x: 50, y: 50 };
  const lair = { x: 54, y: 52, level: 2 };
  const always = () => 0;

  expect(B.raidersNear(home, [{ ...lair, active: true }, { x: 70, y: 70, level: 1, active: true }])).toEqual([{ ...lair, active: true }]);
  expect(B.raidersNear(home, [{ ...lair, active: false }])).toEqual([]);

  const g = B.gatherBanditRaid(s, [lair], T0, always);
  expect(g.banditRaid).toMatchObject({ x: 54, y: 52, level: 2, arrivesAt: T0 + C.BANDIT_RAID.warnMs });
  // About as strong as the village's defense, never weaker than the lair itself.
  expect(g.banditRaid!.strength).toBeGreaterThanOrEqual(C.banditStrength(2));
  // Nothing new while one is under way, or before the day is out.
  expect(B.gatherBanditRaid(g, [lair], T0 + 1000, always)).toBe(g);
  expect(g.banditNextAt).toBe(g.banditRaid!.arrivesAt + C.BANDIT_RAID.everyMs);
  // Shielded: left alone.
  expect(B.gatherBanditRaid({ ...s, shieldUntil: T0 + 1 }, [lair], T0, always).banditRaid).toBeUndefined();
  // No lair near, or the dice say no: look again later.
  expect(B.gatherBanditRaid(s, [], T0, always).banditNextAt).toBe(T0 + C.BANDIT_RAID.retryMs);
  expect(B.gatherBanditRaid(s, [lair], T0, () => 0.99).banditRaid).toBeUndefined();
});

test("a bandit raid: beaten off pays the bounty; lost costs some stores and troops, never the gate; foiled costs nothing", () => {
  const s = E.createInitialState(T0);
  s.shieldUntil = 0;
  s.buildings["city-gate"] = 5;
  s.army.spearman = 100;
  for (const r of C.RESOURCE_IDS) s.resources[r] = 10000;
  const raid = (strength: number) => ({ ...s, banditRaid: { x: 54, y: 52, level: 2, strength, warnedAt: T0, arrivesAt: T0 } });

  const won = B.resolveBanditRaid(raid(10), true, () => 0.5);
  expect(won.cleared).toBe(true);
  expect(won.state.banditReport?.outcome).toBe("won");
  expect(won.state.coins).toBe(s.coins + C.lairBounty(2).coins);
  expect(won.state.banditRaid).toBeUndefined();

  const lost = B.resolveBanditRaid(raid(1e7), true, () => 0.5);
  expect(lost.cleared).toBe(false);
  expect(lost.state.banditReport?.outcome).toBe("lost");
  expect(lost.state.resources.iron).toBeLessThan(10000);
  expect(lost.state.army.spearman).toBe(80); // a fifth lost, not the whole army
  expect(lost.state.buildings["city-gate"]).toBe(5);

  const foiled = B.resolveBanditRaid(raid(1e7), false, () => 0.5);
  expect(foiled.state.banditReport?.outcome).toBe("foiled");
  expect(foiled.state.resources.iron).toBe(10000);
  expect(foiled.state.army.spearman).toBe(100);
});
