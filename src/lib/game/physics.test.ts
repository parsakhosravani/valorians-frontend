/**
 * Game physics: the laws every rule must keep, whatever the numbers in
 * config.ts. Balance tests pin how fast the game goes; these pin that it can't
 * break. A failing test here is a bug, not a balance change.
 *
 * - Time: advancing in one jump or in many steps lands on the same state, and
 *   nothing happens in the past.
 * - Matter: nothing goes negative or becomes NaN; production never fills past
 *   the warehouse; people and resources are neither made nor lost by training
 *   and cancelling.
 * - Battle: losses are bounded by who fought, the stronger side wins, more
 *   troops never fight worse, loot never exceeds what is there to take.
 * - Input: anything a client sends (NaN, negatives, huge numbers, strings,
 *   unknown ids) is refused with a GameError or capped, and never changes the
 *   state on the way.
 * - Chaos: thousands of random actions in random order keep every law.
 */
import { describe, expect, test } from "bun:test";

import * as C from "./config";
import * as E from "./engine";
import * as Tr from "./trade";
import * as W from "./war";
import { clanLevel, techCap, techCost, TECH_IDS } from "./clan";
import { distance, marchMs } from "./map";

const T0 = Date.UTC(2026, 10, 3, 12);
const HOUR = 3600e3;

/** A seeded random number generator, so a failure can be replayed. */
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

/** A tribe somewhere in the mid game, with work under way. */
function midGame(seed = 1) {
  const r = rng(seed);
  let s = E.createInitialState(T0);
  s.buildings["town-hall"] = 12;
  for (const b of C.BUILDINGS) if (b.id !== "town-hall") s.buildings[b.id] = Math.floor(r() * Math.min(b.maxLevel, 12));
  s.buildings.barracks = 5;
  s.buildings.stable = 3;
  // Room for what it holds: stock starts under the warehouse's capacity.
  s.buildings["resource-warehouse"] = 12;
  for (const res of C.RESOURCE_IDS) s.resources[res] = 20_000 + Math.floor(r() * 30_000);
  s.population = 5_000;
  s.army.spearman = 200;
  s.army.axeman = 150;
  s = W.trainTroops(s, "swordsman", 40, T0);
  s = E.upgradeBuilding(s, "iron-mine", T0);
  s.marches.push({
    id: "m",
    target: "camp:3",
    units: { ...E.emptyArmy(), cavalry: 30 },
    loot: { iron: 500, wood: 500, clay: 500, crop: 500 },
    coins: 10,
    returnsAt: T0 + 2 * HOUR,
  });
  return s;
}

const finite = (n: number) => Number.isFinite(n);

/** Every law about a single state. */
function expectSane(s: E.GameState) {
  const r = E.getRates(s);
  for (const res of C.RESOURCE_IDS) {
    expect(finite(s.resources[res])).toBe(true);
    expect(s.resources[res]).toBeGreaterThanOrEqual(0);
  }
  for (const u of C.UNIT_IDS) {
    expect(Number.isInteger(s.army[u])).toBe(true);
    expect(s.army[u]).toBeGreaterThanOrEqual(0);
  }
  for (const b of C.BUILDINGS) {
    expect(s.buildings[b.id]).toBeGreaterThanOrEqual(0);
    expect(s.buildings[b.id]).toBeLessThanOrEqual(b.maxLevel);
  }
  expect(finite(s.coins) && s.coins >= 0).toBe(true);
  expect(finite(s.population) && s.population >= 0).toBe(true);
  expect(finite(s.energy) && s.energy >= 0 && s.energy <= r.energyCapacity).toBe(true);
  expect(s.queue.length).toBeLessThanOrEqual(r.builders);
  expect(new Set(s.queue.map((q) => q.building)).size).toBe(s.queue.length);
  expect(s.training.length).toBeLessThanOrEqual(E.maxTrainBatches(s));
  for (const t of s.training) expect(t.done).toBeLessThan(t.count);
  for (const o of s.outposts) for (const res of C.RESOURCE_IDS) {
    expect(o.fields[res]).toBeGreaterThanOrEqual(0);
    expect(o.fields[res]).toBeLessThanOrEqual(C.OUTPOST.fieldMaxLevel);
  }
  expect(s.outposts.length).toBeLessThanOrEqual(E.outpostSlots(s));
  for (const k of Object.keys(r) as (keyof E.Rates)[]) {
    const v = r[k];
    if (typeof v === "number") expect(finite(v)).toBe(true);
  }
}

describe("time", () => {
  test("advancing in one jump or in many small steps gives the same tribe", () => {
    for (const seed of [1, 2, 3]) {
      const s = midGame(seed);
      const end = T0 + 30 * HOUR;
      const jump = E.advance(s, end);
      let steps = s;
      for (let t = T0; t < end; t += 37 * 60e3) steps = E.advance(steps, t);
      steps = E.advance(steps, end);
      for (const r of C.RESOURCE_IDS) expect(steps.resources[r]).toBeCloseTo(jump.resources[r], 3);
      expect(steps.coins).toBeCloseTo(jump.coins, 3);
      expect(steps.population).toBeCloseTo(jump.population, 3);
      expect(steps.army).toEqual(jump.army);
      expect(steps.buildings).toEqual(jump.buildings);
    }
  });

  test("nothing happens in the past, and advancing doesn't touch the original", () => {
    const s = midGame();
    const copy = JSON.stringify(s);
    expect(E.advance(s, T0 - HOUR)).toEqual(s);
    E.advance(s, T0 + 100 * HOUR);
    expect(JSON.stringify(s)).toBe(copy);
  });

  test("production fills up to the warehouse and never past it, nor destroys what's above it", () => {
    const s = midGame();
    const later = E.advance(s, T0 + 2000 * HOUR);
    const cap = E.getRates(later).capacity;
    // The returning army's 500 of loot may land on top of a full warehouse; production never pushes past it.
    for (const r of ["iron", "wood", "clay"] as const) expect(later.resources[r]).toBeLessThanOrEqual(cap + 500);
    const over = { ...s, resources: { ...s.resources, iron: 10 * cap } };
    expect(E.advance(over, T0 + 10 * HOUR).resources.iron).toBe(10 * cap + 500); // only the loot came in
    expectSane(later);
  });

  test("the same inputs always give the same result", () => {
    const a = midGame(7);
    const b = midGame(7);
    expect(E.advance(a, T0 + 50 * HOUR)).toEqual(E.advance(b, T0 + 50 * HOUR));
    const att = midGame(8);
    att.army.knight = 0;
    expect(W.raidOutcome(midGame(9), att, att.army, 0.3)).toEqual(W.raidOutcome(midGame(9), att, att.army, 0.3));
  });
});

describe("matter", () => {
  test("training then cancelling gives back every resource and person, and never more", () => {
    const s = midGame();
    const trained = W.trainTroops(s, "axeman", 100, T0);
    const back = W.cancelTraining(trained, trained.training[trained.training.length - 1].startsAt, T0);
    for (const r of C.RESOURCE_IDS) expect(back.resources[r]).toBeCloseTo(s.resources[r]);
    expect(back.population).toBeCloseTo(s.population);
    expect(E.peopleOf(back)).toBeCloseTo(E.peopleOf(s));
  });

  test("training moves people from the village into the army, it doesn't make or lose any", () => {
    let s = midGame();
    const before = E.peopleOf(s);
    s = W.trainTroops(s, "spearman", 50, T0);
    expect(E.peopleOf(s)).toBeCloseTo(before);
    // Once trained they're still counted; only growth adds people.
    const later = E.advance(s, T0 + 10 * HOUR);
    expect(E.peopleOf(later)).toBeGreaterThanOrEqual(before);
  });

  test("cancelling a job never gives back more than it cost", () => {
    const s = midGame();
    for (const at of [T0, T0 + 30_000, T0 + 61_000, T0 + 10 * HOUR]) {
      const back = E.cancelBuilding(s, "iron-mine", at);
      for (const r of C.RESOURCE_IDS) expect(back.resources[r]).toBeLessThanOrEqual(s.resources[r] + C.buildingUpgradeCost(C.BUILDING_BY_ID["iron-mine"], s.queue[0].toLevel - 1)[r]);
    }
  });

  test("a building upgrade takes exactly its price", () => {
    const s = midGame();
    const info = E.buildingUpgradeInfo(s, "armory");
    if (info.blocked) return;
    const after = E.upgradeBuilding(s, "armory", T0);
    for (const r of C.RESOURCE_IDS) expect(after.resources[r]).toBeCloseTo(s.resources[r] - info.cost[r]);
  });

  test("a trade pays the price and the goods that arrive never overfill the warehouse", () => {
    const s = midGame();
    s.buildings["trading-post"] = 5;
    // Someone offers 1,000 iron for 800 wood: the buyer pays the 800 wood.
    const offer = Tr.parseOffer({ give: "iron", giveAmount: 1000, want: "wood", wantAmount: 800 });
    const paid = Tr.payForOffer(s, offer);
    expect(paid.resources.wood).toBeCloseTo(s.resources.wood - 800);
    expect(paid.resources.iron).toBeCloseTo(s.resources.iron);
    const full = { ...paid, resources: { ...paid.resources, iron: E.getRates(paid).capacity - 10 } };
    const got = Tr.receiveGoods(full, "iron", 1000);
    expect(got.resources.iron).toBeLessThanOrEqual(E.getRates(full).capacity);
  });

  test("upgrade prices and build times only ever go up with level", () => {
    for (const b of C.BUILDINGS) {
      for (let l = 1; l < b.maxLevel; l++) {
        expect(C.costTotal(C.buildingUpgradeCost(b, l))).toBeGreaterThan(C.costTotal(C.buildingUpgradeCost(b, l - 1)));
        expect(C.buildingUpgradeBaseSeconds(b, l)).toBeGreaterThan(C.buildingUpgradeBaseSeconds(b, l - 1));
      }
    }
    for (let l = 1; l < 30; l++) {
      expect(C.campDefense(l + 1)).toBeGreaterThan(C.campDefense(l));
      expect(techCost(l + 1).iron).toBeGreaterThan(techCost(l).iron);
    }
  });

  test("every building level is worth having: its effect never shrinks", () => {
    for (const b of C.BUILDINGS) {
      let prev = E.getRates(E.createInitialState(0));
      for (let l = 1; l <= b.maxLevel; l++) {
        const s = E.createInitialState(0);
        s.buildings[b.id] = l;
        const r = E.getRates(s);
        // Crop pays one upkeep per level; everything else never goes down.
        for (const res of ["iron", "wood", "clay"] as const) expect(r.productionPerHour[res]).toBeGreaterThanOrEqual(prev.productionPerHour[res]);
        expect(r.capacity).toBeGreaterThanOrEqual(prev.capacity);
        expect(r.coinsPerHour).toBeGreaterThanOrEqual(prev.coinsPerHour);
        expect(r.attackBonus).toBeGreaterThanOrEqual(prev.attackBonus);
        expect(r.defenseBonus).toBeGreaterThanOrEqual(prev.defenseBonus);
        expect(r.flatDefense).toBeGreaterThanOrEqual(prev.flatDefense);
        expect(r.buildSpeedMultiplier).toBeLessThanOrEqual(prev.buildSpeedMultiplier);
        expect(r.builders).toBeGreaterThanOrEqual(prev.builders);
        prev = r;
      }
    }
  });
});

describe("battle", () => {
  const armyOf = (s: E.GameState, r: () => number) => {
    const a = E.emptyArmy();
    for (const u of C.UNIT_IDS) if (!C.UNIT_BY_ID[u].maxOwned && !C.UNIT_BY_ID[u].transport) a[u] = Math.floor(r() * 300);
    s.army = { ...a };
    return a;
  };

  test("a battle fought by several armies splits back exactly: troops, loot and XP add up, nobody loses more than they brought", () => {
    const r = rng(7);
    for (let i = 0; i < 400; i++) {
      const atk = midGame(i);
      const def = midGame(i + 500);
      armyOf(def, r);
      def.shieldUntil = 0;
      const n = 1 + Math.floor(r() * 4);
      const parts = Array.from({ length: n }, () => {
        const a = E.emptyArmy();
        for (const u of C.UNIT_IDS) if (!C.UNIT_BY_ID[u].maxOwned && !C.UNIT_BY_ID[u].transport && r() < 0.6) a[u] = Math.floor(r() * 200);
        const carried = r() < 0.3 ? { iron: Math.floor(r() * 500), wood: 0, clay: 0, crop: 0 } : undefined;
        return { sent: a, returnsAt: 1000 + i, carried };
      });
      const sent = parts.reduce((t, p) => { for (const u of C.UNIT_IDS) t[u] += p.sent[u]; return t; }, E.emptyArmy());
      atk.army = { ...sent };
      const { report } = W.defendRaid(def, atk, sent, 0, r(), {});
      const pieces = W.splitRaid(report, parts);
      for (const u of C.UNIT_IDS) {
        expect(pieces.reduce((t, p) => t + p.attackerLosses[u], 0)).toBe(report.attackerLosses[u]);
        expect(pieces.reduce((t, p) => t + p.attackerHealed[u], 0)).toBe(report.attackerHealed[u]);
        expect(pieces.reduce((t, p) => t + (p.attackerXp?.[u] ?? 0), 0)).toBe(report.attackerXp?.[u] ?? 0);
        pieces.forEach((p, k) => {
          expect(p.attackerLosses[u]).toBeGreaterThanOrEqual(0);
          expect(p.attackerLosses[u] + p.attackerHealed[u]).toBeLessThanOrEqual(parts[k].sent[u]);
        });
      }
      for (const res of C.RESOURCE_IDS) {
        expect(pieces.reduce((t, p) => t + p.loot[res], 0)).toBe(report.loot[res]);
        for (const p of pieces) expect(p.loot[res]).toBeGreaterThanOrEqual(0);
      }
      expect(pieces.reduce((t, p) => t + p.coins, 0)).toBe(report.coins);
    }
  });

  test("losses never exceed who fought; the stronger side wins; luck stays within its bounds", () => {
    const r = rng(42);
    for (let i = 0; i < 500; i++) {
      const atk = midGame(i);
      const def = midGame(i + 1000);
      const sent = armyOf(atk, r);
      armyOf(def, r);
      const luckRoll = r();
      const { outcome, defenders } = W.raidOutcome(def, atk, sent, luckRoll);
      expect(outcome.luck).toBeGreaterThanOrEqual(1 - C.LUCK);
      expect(outcome.luck).toBeLessThanOrEqual(1 + C.LUCK);
      expect(outcome.attackerWon).toBe(outcome.attack > outcome.defense);
      for (const u of C.UNIT_IDS) {
        expect(outcome.attackerLosses[u]).toBeGreaterThanOrEqual(0);
        expect(outcome.attackerLosses[u] + outcome.attackerHealed[u]).toBeLessThanOrEqual(sent[u]);
        expect(outcome.defenderLosses[u]).toBeGreaterThanOrEqual(0);
        expect(outcome.defenderLosses[u] + outcome.defenderHealed[u]).toBeLessThanOrEqual(defenders[u]);
      }
      // The winner always keeps someone to carry the spoils home.
      if (outcome.attackerWon && W.fighterCount(sent) > 0) {
        expect(C.UNIT_IDS.some((u) => sent[u] - outcome.attackerLosses[u] > 0)).toBe(true);
      }
    }
  });

  test("more troops never attack or defend worse", () => {
    const s = midGame();
    for (const u of C.UNIT_IDS) {
      if (C.UNIT_BY_ID[u].transport) continue;
      const few = { ...E.emptyArmy(), [u]: 10 };
      const many = { ...E.emptyArmy(), [u]: 11 };
      expect(W.attackPower(s, many)).toBeGreaterThanOrEqual(W.attackPower(s, few));
      const d1 = { ...s, army: few };
      const d2 = { ...s, army: many };
      expect(W.defensePower(d2)).toBeGreaterThanOrEqual(W.defensePower(d1));
    }
  });

  test("siege never makes a defense stronger, and can't take it below the troops' own", () => {
    const d = midGame();
    d.buildings["city-gate"] = 15;
    d.buildings.watchtower = 10;
    const full = W.defensePower(d);
    let prev = full;
    for (const rams of [0, 10, 50, 150, 1000]) {
      const v = W.defensePower(d, { ...E.emptyArmy(), ram: rams, catapult: rams });
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
    const bare = { ...d, buildings: { ...d.buildings, "city-gate": 0, watchtower: 0 } };
    expect(prev).toBeCloseTo(W.defensePower(bare));
  });

  test("a raid never takes more than half of what isn't hidden, nor more than the army carries", () => {
    const r = rng(7);
    for (let i = 0; i < 200; i++) {
      const atk = midGame(i);
      atk.shieldUntil = 0;
      const def = midGame(i + 500);
      def.shieldUntil = 0;
      def.army = E.emptyArmy();
      const sent = { ...E.emptyArmy(), cavalry: 1 + Math.floor(r() * 2000) };
      const { report } = W.defendRaid(def, atk, sent, T0, r());
      const hidden = E.getRates(def).hidden;
      const taken = C.RESOURCE_IDS.reduce((a, res) => a + report.loot[res], 0);
      const survivors = { ...E.emptyArmy(), cavalry: sent.cavalry - report.attackerLosses.cavalry };
      expect(taken).toBeLessThanOrEqual(W.carryOf(survivors) + 1);
      for (const res of C.RESOURCE_IDS) {
        expect(report.loot[res]).toBeGreaterThanOrEqual(0);
        expect(report.loot[res]).toBeLessThanOrEqual(Math.max(0, def.resources[res] - hidden) * C.MAX_LOOT_SHARE + 1);
      }
    }
  });

  test("traps never catch more than TRAP_MAX, and never the dragon", () => {
    const def = midGame();
    def.buildings.trapmaker = 20;
    const atk = midGame(2);
    const sent = { ...E.emptyArmy(), axeman: 1000, dragon: 1 };
    const { outcome } = W.raidOutcome(def, atk, sent, 0.5);
    expect(outcome.attackerTrapped!.axeman).toBeLessThanOrEqual(1000 * C.TRAP_MAX);
    expect(outcome.attackerTrapped!.dragon).toBe(0);
  });

  test("XP only ever grows with a bigger win, and a defeat never teaches more than a win", () => {
    const s = midGame();
    const fought = { ...E.emptyArmy(), axeman: 100 };
    let prev = 0;
    for (const enemy of [10, 100, 1000, 1e4, 1e5, 1e6]) {
      const xp = W.battleXp(s, fought, enemy, true, "attack").axeman;
      expect(xp).toBeGreaterThanOrEqual(prev);
      expect(W.battleXp(s, fought, enemy, false, "attack").axeman).toBeLessThanOrEqual(xp);
      prev = xp;
    }
  });
});

describe("map and clans", () => {
  test("distance is symmetric and marching further never takes less time", () => {
    const a = { x: 3, y: -7 };
    const b = { x: -20, y: 14 };
    expect(distance(a, b)).toBeCloseTo(distance(b, a));
    const army = { ...E.emptyArmy(), axeman: 10, cavalry: 5 };
    let prev = 0;
    for (const d of [0, 1, 5, 10, 50, 200]) {
      const ms = marchMs(army, d);
      expect(ms).toBeGreaterThanOrEqual(prev);
      prev = ms;
    }
    // An army marches at its slowest unit.
    expect(marchMs(army, 10)).toBe(marchMs({ ...E.emptyArmy(), axeman: 1 }, 10));
  });

  test("attacks on players always give the defender time to react", () => {
    // Even next door with the fastest troops and a maxed War Hall.
    expect(W.raidTravelMs(1000)).toBe(C.MIN_RAID_MARCH_SECONDS * 1000);
    expect(W.raidTravelMs(3 * HOUR)).toBe(3 * HOUR);
  });

  test("a clan levels up only when every tech reaches the cap", () => {
    const techs = Object.fromEntries(TECH_IDS.map((t) => [t, 5])) as Record<(typeof TECH_IDS)[number], number>;
    expect(clanLevel(techs)).toBe(2);
    expect(techCap(techs)).toBe(10);
    techs.fields = 4;
    expect(clanLevel(techs)).toBe(1);
  });
});

describe("input from clients", () => {
  const junk: unknown[] = [NaN, -1, -0.5, 0, 0.4, Infinity, -Infinity, 1e12, "12", "abc", null, undefined, {}, [], true];

  test("training refuses junk counts without changing anything", () => {
    const s = midGame();
    const copy = JSON.stringify(s);
    for (const n of junk) {
      try {
        const out = W.trainTroops(s, "spearman", n as number, T0);
        // Accepted only as a real whole count in range.
        const added = out.training[out.training.length - 1].count;
        expect(Number.isInteger(added) && added >= 1 && added <= C.MAX_BATCH).toBe(true);
      } catch (e) {
        expect(e).toBeInstanceOf(E.GameError);
      }
      expect(JSON.stringify(s)).toBe(copy);
    }
    for (const id of ["wizard", "__proto__", "toString", "constructor"]) {
      expect(() => W.trainTroops(s, id as C.UnitId, 1, T0)).toThrow(E.GameError);
    }
  });

  test("buildings refuse unknown ids", () => {
    const s = midGame();
    for (const id of ["", "castle", "__proto__", "constructor", "toString"]) {
      expect(() => E.upgradeBuilding(s, id, T0)).toThrow(E.GameError);
    }
  });

  test("taps are capped whatever the client claims", () => {
    const s = midGame();
    s.lastTapAt = T0 - 1000;
    const before = s.resources.iron;
    const cap = E.getRates(s).capacity;
    const r = E.applyTaps(s, "iron", { taps: 1e9, crits: 1e9, comboSum: 1e12, frenzyTaps: 1e9 }, T0);
    // One second of tapping: at most MAX_TAPS_PER_SECOND + TAP_BURST taps.
    expect(r.accepted).toBeLessThanOrEqual(C.MAX_TAPS_PER_SECOND + C.TAP_BURST);
    expect(r.state.resources.iron).toBeLessThanOrEqual(Math.max(before, cap));
    for (const v of junk) {
      try {
        const out = E.applyTaps(s, "iron", { taps: v as number, crits: v as number, comboSum: v as number }, T0);
        expectSane(out.state);
      } catch (e) {
        expect(e).toBeInstanceOf(E.GameError);
      }
    }
    expect(() => E.applyTaps(s, "gold" as C.ResourceId, 10, T0)).toThrow(E.GameError);
  });

  test("armies can't be sent with troops the tribe doesn't have, or negative ones", () => {
    const s = midGame();
    s.shieldUntil = 0;
    for (const bad of [{ spearman: -50 }, { spearman: 1e9 }, { spearman: NaN }, { axeman: 0.5 }, {}]) {
      try {
        const { sent } = W.dispatchRaid(s, { ...E.emptyArmy(), ...bad } as E.Army, T0);
        for (const u of C.UNIT_IDS) {
          expect(sent[u]).toBeGreaterThanOrEqual(0);
          expect(sent[u]).toBeLessThanOrEqual(s.army[u]);
        }
      } catch (e) {
        expect(e).toBeInstanceOf(E.GameError);
      }
    }
  });

  test("market offers refuse junk", () => {
    for (const v of junk) {
      expect(() => Tr.parseOffer({ give: "iron", giveAmount: v, want: "wood", wantAmount: 100 })).toThrow(E.GameError);
    }
    expect(() => Tr.parseOffer({ give: "iron", giveAmount: 100, want: "iron", wantAmount: 100 })).toThrow(E.GameError);
    expect(() => Tr.parseOffer({ give: "gold", giveAmount: 100, want: "iron", wantAmount: 100 })).toThrow(E.GameError);
  });
});

describe("chaos", () => {
  test("thousands of random actions in random order keep every law", () => {
    const r = rng(2026);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
    for (let game = 0; game < 20; game++) {
      let s = E.createInitialState(T0);
      let now = T0;
      for (let i = 0; i < 300; i++) {
        now += Math.floor(r() * 3 * HOUR);
        s = E.advance(s, now);
        const before = JSON.stringify(s);
        try {
          switch (Math.floor(r() * 11)) {
            case 0:
              s = E.upgradeBuilding(s, pick(C.BUILDINGS).id, now);
              break;
            case 1:
              s = W.trainTroops(s, pick(C.UNIT_IDS), 1 + Math.floor(r() * 80), now);
              break;
            case 2:
              if (s.training.length) s = W.cancelTraining(s, pick(s.training).startsAt, now);
              break;
            case 3:
              s = E.applyTaps(s, pick(C.RESOURCE_IDS), Math.floor(r() * 60), now).state;
              break;
            case 4:
              s = E.claimStreak(s, now);
              break;
            case 5: {
              const level = s.camps.cleared + 1;
              if (W.fighterCount(s.army) > 0) s = W.raidCamp(s, level, s.army, now, r()).state;
              break;
            }
            case 6:
              if (s.queue.length) s = E.cancelBuilding(s, pick(s.queue).building, now);
              break;
            case 7:
              if (s.queue.length) s = E.finishBuilding(s, pick(s.queue).building, now);
              break;
            case 8:
              s = E.masterBuilding(s, pick(C.BUILDINGS).id, now);
              break;
            case 9:
              s = E.foundOutpost(s, { x: Math.floor(r() * 50), y: Math.floor(r() * 50) }, now);
              break;
            case 10:
              if (s.outposts.length) s = E.upgradeField(s, Math.floor(r() * s.outposts.length), pick(C.RESOURCE_IDS), now);
              break;
          }
        } catch (e) {
          // Refusing is fine; anything but a GameError is a bug, and a refusal changes nothing.
          expect(e).toBeInstanceOf(E.GameError);
          expect(JSON.stringify(s)).toBe(before);
        }
        expectSane(s);
      }
    }
  }, 60_000);
});
