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
  expect(C.clanLevel(techs)).toBe(7);
  expect(C.perksFor(techs)).toEqual({ production: 9, attack: 2, defense: 0 });
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
