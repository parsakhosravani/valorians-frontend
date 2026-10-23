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
  expect(W.defensePower(d, 50)).toBeLessThan(W.defensePower(d, 0));
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
