import { test, expect } from "bun:test";
import * as C from "./clan";
import * as E from "./engine";
import { CLAN } from "./config";

const T0 = Date.UTC(2026, 9, 26, 10);

test("default flags are valid, stable and vary between clans", () => {
  const seen = new Set<string>();

  for (let id = 1; id <= 50; id++) {
    const f = C.defaultFlag(id);

    expect(C.parseFlag(f)).toEqual(f);
    expect(f.fg).not.toBe(f.bg);
    expect(C.defaultFlag(id)).toEqual(f);
    seen.add(JSON.stringify(f));
  }
  expect(seen.size).toBeGreaterThan(40);
});

test("parseFlag rejects anything out of range", () => {
  expect(C.parseFlag({ bg: 0, fg: 1, pattern: "cross", emblem: 3 })).toEqual({ bg: 0, fg: 1, pattern: "cross", emblem: 3 });
  expect(C.parseFlag({ bg: 0, fg: 1, pattern: "cross", emblem: -1 })?.emblem).toBe(-1);
  expect(C.parseFlag({ bg: 99, fg: 1, pattern: "cross", emblem: 3 })).toBeNull();
  expect(C.parseFlag({ bg: 0, fg: 1, pattern: "dragon", emblem: 3 })).toBeNull();
  expect(C.parseFlag({ bg: 0, fg: 1.5, pattern: "cross", emblem: 3 })).toBeNull();
  expect(C.parseFlag({ bg: 0, fg: 1, pattern: "cross", emblem: 999 })).toBeNull();
  expect(C.parseFlag(null)).toBeNull();
  expect(C.storedFlag("not json", 7)).toEqual(C.defaultFlag(7));
});

test("tech costs grow and perks follow levels", () => {
  expect(C.techCost(0)).toEqual({ iron: 4000, wood: 4000, clay: 4000, crop: 4000, coins: 500 });
  expect(C.techCost(1).iron).toBeGreaterThan(C.techCost(0).iron);
  const techs = { hall: 2, fields: 3, banners: 1, shieldwall: 0 };

  expect(C.maxMembers(techs)).toBe(CLAN.maxMembers + 2 * CLAN.seatsPerHallLevel);
  expect(C.perksFor(techs, 2)).toEqual({ production: 9, attack: 2, defense: 0 });
  expect(C.canAfford({ ...C.emptyTreasury(), iron: 4000, wood: 4000, clay: 4000, crop: 4000, coins: 499 }, C.techCost(0))).toBe(false);
});

test("roles: only the right ranks can kick", () => {
  expect(C.canKick("leader", "officer")).toBe(true);
  expect(C.canKick("officer", "member")).toBe(true);
  expect(C.canKick("officer", "officer")).toBe(false);
  expect(C.canKick("member", "member")).toBe(false);
  expect(C.canKick("leader", "leader")).toBe(false);
});

test("clan perks raise production, attack and defense", () => {
  const base = E.createInitialState(T0);
  const boosted = { ...base, clanPerks: { production: 10, attack: 4, defense: 6 } };
  const r0 = E.getRates(base);
  const r1 = E.getRates(boosted);

  expect(r1.productionPerHour.iron).toBeCloseTo(r0.productionPerHour.iron * 1.1);
  expect(r1.productionPerHour.crop).toBeGreaterThan(r0.productionPerHour.crop);
  expect(r1.attackBonus - r0.attackBonus).toBeCloseTo(0.04);
  expect(r1.defenseBonus - r0.defenseBonus).toBeCloseTo(0.06);
  // Old saves without perks still load.
  const { clanPerks: _p, ...old } = base;

  expect(E.normalizeState(old as E.GameState).clanPerks).toEqual(C.NO_PERKS);
});

test("clan level rises when every tech reaches the cap, with no top", () => {
  const step = CLAN.techLevelsPerClanLevel;
  const at = (hall: number, fields: number, banners: number, shieldwall: number) => ({ hall, fields, banners, shieldwall });

  expect(C.clanLevel(at(0, 0, 0, 0))).toBe(1);
  expect(C.techCap(at(0, 0, 0, 0))).toBe(step);
  // One tech behind holds the whole clan at level 1.
  expect(C.clanLevel(at(step - 1, step, step, step))).toBe(1);
  expect(C.techCap(at(step - 1, step, step, step))).toBe(step);
  // All four at the cap: level 2, techs may go 5 levels higher.
  expect(C.clanLevel(at(step, step, step, step))).toBe(2);
  expect(C.techCap(at(step, step, step, step))).toBe(2 * step);
  expect(C.clanLevel(at(4 * step, 4 * step, 4 * step, 4 * step + 3))).toBe(5);
  // Costs keep growing past the old level-5 top.
  expect(C.techCost(step + 1).iron).toBeGreaterThan(C.techCost(step).iron);
});

test("a clan of one is still forming: no perks until a second chief joins", () => {
  const techs = { hall: 1, fields: 5, banners: 5, shieldwall: 5 };

  expect(C.isFormed(1)).toBe(false);
  expect(C.isFormed(CLAN.minMembers)).toBe(true);
  expect(C.perksFor(techs, 1)).toEqual(C.NO_PERKS);
  expect(C.perksFor(techs, 2)).toEqual({
    production: 5 * CLAN.fieldsPercent,
    attack: 5 * CLAN.bannersPercent,
    defense: 5 * CLAN.shieldwallPercent,
  });
});
