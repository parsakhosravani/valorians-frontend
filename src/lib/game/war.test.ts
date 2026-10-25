import { expect, test } from "bun:test";

import * as E from "./engine";
import * as W from "./war";
import { campDefense, hiddenResources } from "./config";

const T0 = Date.UTC(2026, 9, 23, 10);

const withBarracks = (lvl = 1) => {
  const s = E.createInitialState(T0);
  s.buildings.barracks = lvl;
  s.resources = { iron: 14000, wood: 14000, clay: 14000, crop: 14000 };
  return s;
};

test("training needs the building, costs resources and finishes over time", () => {
  const s0 = E.createInitialState(T0);
  expect(() => W.trainTroops(s0, "spearman", 5, T0)).toThrow("Needs Barracks level 1");

  let s = W.trainTroops(withBarracks(), "spearman", 10, T0);
  expect(s.resources.wood).toBe(14000 - 450);
  expect(() => W.trainTroops(s, "archer", 1, T0)).toThrow("Needs Barracks level 3");

  s = E.advance(s, T0 + 15_000 * 4 + 500);
  expect(s.army.spearman).toBe(4);
  s = E.advance(s, T0 + 15_000 * 10);
  expect(s.army.spearman).toBe(10);
  expect(s.training.length).toBe(0);
  // 10 spearmen eat 10 crop/h
  expect(E.getRates(s).troopUpkeep).toBe(10);
});

test("second batch waits for the first", () => {
  let s = W.trainTroops(withBarracks(), "spearman", 2, T0);
  s = W.trainTroops(s, "spearman", 2, T0);
  expect(s.training[1].startsAt).toBe(T0 + 30_000);
});

test("camp: strong army wins, gets reward on return, unlocks next camp", () => {
  let s = withBarracks();
  s.army.spearman = 50; // 600 attack vs camp 1 defense 80
  const { state, report } = W.raidCamp(s, 1, { ...E.emptyArmy(), spearman: 50 }, T0, 0.5);
  expect(report.attackerWon).toBe(true);
  expect(state.army.spearman).toBe(0); // away
  expect(state.camps.cleared).toBe(1);
  expect(W.campStatus(state, 1, T0).state).toBe("cooldown");
  expect(W.campStatus(state, 2, T0).state).toBe("new");
  expect(W.campStatus(state, 3, T0).state).toBe("locked");

  const back = E.advance(state, report.returnsAt + 1);
  expect(back.army.spearman).toBeGreaterThan(45);
  expect(back.coins).toBeGreaterThan(state.coins + 99);
});

test("camp: weak army is wiped out", () => {
  const s = withBarracks();
  s.army.spearman = 2; // 24 attack vs 80
  const { state, report } = W.raidCamp(s, 1, { ...E.emptyArmy(), spearman: 2 }, T0, 0.5);
  expect(report.attackerWon).toBe(false);
  expect(state.marches.length).toBe(0);
  expect(state.camps.cleared).toBe(0);
  expect(campDefense(1)).toBe(80);
});

test("raid: shields, loot limited by carry and hideout, defender shielded after", () => {
  const attacker = withBarracks();
  attacker.army.cavalry = 100;
  const defender = E.createInitialState(T0); // new-player shield
  expect(() => W.defendRaid(defender, attacker, { ...E.emptyArmy(), cavalry: 100 }, T0, 0.5)).toThrow("shield");

  defender.shieldUntil = 0;
  defender.resources = { iron: 10000, wood: 10000, clay: 10000, crop: 10000 };
  const d = W.dispatchRaid(attacker, { ...E.emptyArmy(), cavalry: 100 }, T0);
  expect(d.state.army.cavalry).toBe(0);
  expect(d.state.shieldUntil).toBeLessThanOrEqual(T0);

  const { state: def2, report } = W.defendRaid(defender, d.state, d.sent, T0, 0.5);
  expect(report.attackerWon).toBe(true);
  const protectedAmount = hiddenResources(0);
  // takes at most half of what isn't hidden
  expect(report.loot.iron).toBeLessThanOrEqual((10000 - protectedAmount) * 0.5);
  expect(def2.resources.iron).toBe(10000 - report.loot.iron);
  expect(def2.shieldUntil).toBeGreaterThan(T0);
  expect(def2.war.defensesLost).toBe(1);

  const atk2 = W.receiveRaidReport(d.state, report, "Bob", T0, 0.3);
  expect(atk2.marches.length).toBe(1);
  const home = E.advance(atk2, report.returnsAt);
  expect(home.army.cavalry).toBeGreaterThan(90);
  expect(home.war.attacksWon).toBe(1);
});

test("defenders and walls can win", () => {
  const attacker = withBarracks();
  attacker.army.spearman = 20; // 240 attack
  const defender = withBarracks();
  defender.shieldUntil = 0;
  defender.army.spearman = 30; // 540 def
  defender.buildings["city-gate"] = 5;
  const { state, report } = W.defendRaid(defender, attacker, { ...E.emptyArmy(), spearman: 20 }, T0, 0.5);
  expect(report.attackerWon).toBe(false);
  expect(state.army.spearman).toBeGreaterThan(0);
  expect(state.army.spearman).toBeLessThan(30);
  expect(state.war.defensesWon).toBe(1);
});

test("rams weaken walls", () => {
  const d = withBarracks();
  d.buildings["city-gate"] = 10;
  const rams = { ...E.emptyArmy(), ram: 50 };
  // 50 rams × 2% = the whole 60% gate bonus is gone
  expect(W.defensePower(d, rams) * 1.6).toBeCloseTo(W.defensePower(d));
});

test("catapults break the Watchtower", () => {
  const d = withBarracks();
  d.buildings.watchtower = 10; // 600 flat defense
  const full = W.defensePower(d);
  const hit = W.defensePower(d, { ...E.emptyArmy(), catapult: 10 }); // −30% of 600
  expect(full - hit).toBeCloseTo(180 * (1 + E.getRates(d).defenseBonus));
});

test("new troops unlock at higher building levels", () => {
  const s = withBarracks(5);
  expect(() => W.trainTroops(s, "berserker", 1, T0)).not.toThrow();
  expect(() => W.trainTroops(s, "huscarl", 1, T0)).toThrow("Needs Barracks level 10");
  s.buildings.stable = 4;
  expect(() => W.trainTroops(s, "raider", 1, T0)).toThrow("Needs Stable level 5");
});

test("raiders count as mounted, huscarls as anti-cavalry", () => {
  const atk = withBarracks();
  const def = withBarracks();
  def.army.huscarl = 50;
  const raid = { ...E.emptyArmy(), raider: 100 };
  const foot = { ...E.emptyArmy(), berserker: 74 }; // about the same attack as the raiders
  const vsRaiders = W.battleNumbers(atk, raid, def, "plains");
  const vsFoot = W.battleNumbers(atk, foot, def, "plains");
  expect(vsRaiders.defense).toBeGreaterThan(vsFoot.defense * 1.2);
  expect(W.battleNumbers(atk, raid, def, "forest").attack).toBeCloseTo(vsRaiders.attack * 0.75);
});

test("old saves get war fields", () => {
  const old = E.createInitialState(T0) as any;
  delete old.army;
  delete old.shieldUntil;
  delete old.camps;
  const s = E.normalizeState(old);
  expect(s.army.spearman).toBe(0);
  expect(s.shieldUntil).toBe(0);
  expect(s.camps.cleared).toBe(0);
});

// ─── Ranks and upgrades ──────────────────────────────────────────────────────

test("winning at a camp gives XP; enough XP promotes the regiment and makes it stronger", () => {
  let s = withBarracks();
  s.army.spearman = 50;
  const weak = W.attackPower(s, s.army);
  const { state, report } = W.raidCamp(s, 1, { ...E.emptyArmy(), spearman: 50 }, T0, 0.5);
  // camp 1 defense 80 × 0.2 = 16 XP, all for the spearmen
  expect(report.attackerXp?.spearman).toBe(16);
  expect(state.troops.spearman.xp).toBeGreaterThan(14);
  expect(E.unitRank(state, "spearman")).toBe(0);

  s = withBarracks();
  s.army.spearman = 50;
  s.troops.spearman.xp = 95;
  const r2 = W.raidCamp(s, 1, { ...E.emptyArmy(), spearman: 50 }, T0, 0.5);
  expect(r2.report.attackerPromoted).toEqual([{ unit: "spearman", rank: 1 }]);
  const back = E.advance(r2.state, r2.report.returnsAt + 1);
  expect(W.attackPower(back, { ...E.emptyArmy(), spearman: 50 })).toBeCloseTo(weak * 1.04);
});

test("XP is shared by contribution and a wiped-out regiment loses some of its XP", () => {
  const s = withBarracks(3);
  s.buildings.stable = 1;
  s.army = { spearman: 10, archer: 0, cavalry: 10, ram: 0 };
  const xp = W.battleXp(s, s.army, 1000, true, "attack");
  // spears 12×10 vs cavalry 45×10 → 120:450 of 200 XP
  expect(xp.spearman).toBe(42);
  expect(xp.cavalry).toBe(158);

  const t = withBarracks();
  t.army.spearman = 2;
  t.troops.spearman.xp = 1000;
  const { state } = W.raidCamp(t, 1, { ...E.emptyArmy(), spearman: 2 }, T0, 0.5);
  // all 2 died: −40%, then +8 XP for the lost fight (80 × 0.2 × 0.5)
  expect(state.troops.spearman.xp).toBe(608);
});

test("defenders earn XP too, and raid attackers get theirs when the report arrives", () => {
  const atk = withBarracks();
  atk.army.spearman = 100;
  const def = withBarracks();
  def.shieldUntil = 0;
  def.army.spearman = 5;
  const d = W.dispatchRaid(atk, { ...E.emptyArmy(), spearman: 100 }, T0);
  const { state: defAfter, report } = W.defendRaid(def, d.state, d.sent, T0, 0.5);
  expect(report.attackerWon).toBe(true);
  expect(report.defenderXp!.spearman).toBeGreaterThan(0);
  expect(defAfter.troops.spearman.xp).toBeGreaterThan(0);

  const atkAfter = W.receiveRaidReport(d.state, report, "Def", T0, 0.3);
  expect(atkAfter.troops.spearman.xp).toBeGreaterThan(0);
});

test("Arsenal upgrades: need the Arsenal and rank, cost resources, finish over time", () => {
  let s = withBarracks();
  expect(() => W.upgradeTroop(s, "spearman", T0)).toThrow("Build the Arsenal");
  s.buildings.arsenal = 1;
  s = W.upgradeTroop(s, "spearman", T0);
  expect(s.resources.iron).toBe(14000 - 500);
  expect(() => W.upgradeTroop(s, "spearman", T0)).toThrow("already forging");
  const ends = s.forge!.endsAt;
  expect(E.advance(s, ends - 1).troops.spearman.level).toBe(0);
  s = E.advance(s, ends);
  expect(s.troops.spearman.level).toBe(1);
  expect(s.forge).toBeNull();
  expect(E.unitMultiplier(s, "spearman")).toBeCloseTo(1.05);

  // A Recruit regiment stops at level 2
  s.troops.spearman.level = 2;
  expect(() => W.upgradeTroop(s, "spearman", T0)).toThrow("more battle experience");
  s.troops.spearman.xp = 100; // Soldier → cap 4
  expect(() => W.upgradeTroop(s, "spearman", T0)).not.toThrow();
});

test("states saved before ranks existed still work everywhere", () => {
  const old = E.createInitialState(T0) as any;
  delete old.troops;
  delete old.forge;
  old.army.spearman = 10;
  const s = E.advance(old, T0 + 1000);
  expect(W.powerScore(s)).toBeGreaterThan(0);
  expect(W.defensePower(s)).toBeGreaterThan(0);
  expect(E.normalizeState(old).troops.spearman).toEqual({ xp: 0, level: 0 });
});
