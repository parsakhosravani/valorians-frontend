import { expect, test } from "bun:test";

import * as E from "./engine";
import * as W from "./war";
import * as M from "./map";
import { campDefense, hiddenResources } from "./config";
import * as C from "./config";

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
  expect(s.resources.wood).toBe(14000 - 430);
  expect(() => W.trainTroops(s, "archer", 1, T0)).toThrow("Needs Barracks level 3");

  s = E.advance(s, T0 + 20_000 * 4 + 500);
  expect(s.army.spearman).toBe(4);
  s = E.advance(s, T0 + 20_000 * 10);
  expect(s.army.spearman).toBe(10);
  expect(s.training.length).toBe(0);
  // 10 spearmen eat 10 crop/h
  expect(E.getRates(s).troopUpkeep).toBe(10);
});

test("second batch waits for the first", () => {
  let s = W.trainTroops(withBarracks(), "spearman", 2, T0);
  s = W.trainTroops(s, "spearman", 2, T0);
  expect(s.training[1].startsAt).toBe(T0 + 40_000);
});

test("camp: strong army wins, gets reward on return, unlocks next camp", () => {
  const s = withBarracks();
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

test("loot all lands at home, even past the warehouse's capacity", () => {
  const s = withBarracks();
  s.army.spearman = 50;
  const { state, report } = W.raidCamp(s, 1, { ...E.emptyArmy(), spearman: 50 }, T0, 0.5);
  expect(report.attackerWon).toBe(true);
  const cap = E.getRates(state).capacity;
  // Storage full when the army gets home.
  state.resources = { iron: cap, wood: cap, clay: cap, crop: cap };
  state.updatedAt = report.returnsAt;

  const back = E.advance(state, report.returnsAt + 1);
  expect(state.marches[0].loot.iron).toBeGreaterThan(0);
  expect(back.resources.iron).toBe(cap + state.marches[0].loot.iron);
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

test("camp: a narrow win always leaves someone to bring the loot home", () => {
  // 7 spearmen sit right at camp 1's defense, so some luck rolls win by a hair.
  let narrowWins = 0;
  for (let i = 0; i < 100; i++) {
    const s = withBarracks();
    s.army.spearman = 7;
    const { state, report } = W.raidCamp(s, 1, { ...E.emptyArmy(), spearman: 7 }, T0, i / 100);
    if (!report.attackerWon) continue;
    if (report.defense / report.attack > 0.95) narrowWins += 1;
    expect(state.marches.length).toBe(1);
    const back = E.advance(state, report.returnsAt + 1);
    expect(back.army.spearman).toBeGreaterThan(0);
    expect(back.resources.iron).toBeGreaterThan(state.resources.iron);
  }
  expect(narrowWins).toBeGreaterThan(0);
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
  // takes at most what isn't hidden
  expect(report.loot.iron).toBeLessThanOrEqual(10000 - protectedAmount);
  expect(def2.resources.iron).toBe(10000 - report.loot.iron);
  expect(def2.shieldUntil).toBeGreaterThan(T0);
  expect(def2.war.defensesLost).toBe(1);

  const atk2 = W.receiveRaidReport(d.state, report, "Bob", T0, 0.3);
  expect(atk2.marches.length).toBe(1);
  const home = E.advance(atk2, report.returnsAt);
  expect(home.army.cavalry).toBeGreaterThan(90);
  expect(home.war.attacksWon).toBe(1);
});

test("only the Hideout hides: raiders with room take everything above it, the Hideout keeps at most a quarter", () => {
  const attacker = withBarracks();
  attacker.army.cavalry = 1000; // carries 100k, more than there is
  const defender = E.createInitialState(T0);
  defender.shieldUntil = 0;
  defender.buildings.hideout = 20; // would hide 418k a resource uncapped
  const cap = E.getRates(defender).capacity;
  defender.resources = { iron: cap, wood: cap, clay: cap, crop: cap };
  const hidden = E.getRates(defender).hidden;
  expect(hidden).toBe(Math.round(cap * C.HIDEOUT_MAX_SHARE));
  expect(hidden).toBeLessThan(hiddenResources(20));

  const d = W.dispatchRaid(attacker, { ...E.emptyArmy(), cavalry: 1000 }, T0);
  const { state: after, report } = W.defendRaid(defender, d.state, d.sent, T0, 0.5);
  expect(report.attackerWon).toBe(true);
  const share = report.weakTarget ? C.LOOT_WEAK_SHARE : 1;
  for (const r of C.RESOURCE_IDS) {
    expect(report.loot[r]).toBe(Math.floor((cap - hidden) * share));
    expect(after.resources[r]).toBeGreaterThanOrEqual(hidden);
  }
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
  d.buildings["city-gate"] = 20;
  // 10 rams break a level: 200 take the whole 60% bonus of a City Gate 20, 100 half of it.
  const rams = (n: number) => ({ ...E.emptyArmy(), ram: n });
  expect(W.defensePower(d, rams(200)) * 1.6).toBeCloseTo(W.defensePower(d));
  expect((W.defensePower(d, rams(100)) / 1.3) * 1.6).toBeCloseTo(W.defensePower(d));
  // A small gate falls to few rams.
  d.buildings["city-gate"] = 5;
  expect(W.defensePower(d, rams(50)) * 1.15).toBeCloseTo(W.defensePower(d));
});

test("catapults break the Watchtower", () => {
  const d = withBarracks();
  d.buildings.watchtower = 10;
  const tower = E.getRates(d).flatDefense;
  expect(tower).toBeCloseTo(C.compoundAt(60, 10, 1.12)); // ~1,050: 60 at level 1, 12% more each level
  const full = W.defensePower(d);
  const hit = W.defensePower(d, { ...E.emptyArmy(), catapult: 20 }); // 2.5 of its 10 levels: −25% of the tower
  expect(full - hit).toBeCloseTo(tower * 0.25 * (1 + E.getRates(d).defenseBonus));
});

test("new troops unlock at higher building levels", () => {
  const s = withBarracks(5);
  expect(() => W.trainTroops(s, "swordsman", 1, T0)).not.toThrow();
  expect(() => W.trainTroops(s, "axeman", 1, T0)).not.toThrow();
  s.buildings.stable = 3;
  expect(() => W.trainTroops(s, "paladin", 1, T0)).not.toThrow();
  expect(() => W.trainTroops(s, "knight", 1, T0)).toThrow("Needs Stable level 10");
});

test("knights are mounted: weaker in forests and countered by spearmen", () => {
  const atk = withBarracks();
  const def = withBarracks();
  def.army.spearman = 100;
  const knights = { ...E.emptyArmy(), knight: 75 };
  const axes = { ...E.emptyArmy(), axeman: 200 }; // same attack as the knights
  const vsKnights = W.battleNumbers(atk, knights, def, "plains");
  const vsAxes = W.battleNumbers(atk, axes, def, "plains");
  expect(vsKnights.attack).toBeCloseTo(vsAxes.attack);
  expect(vsKnights.defense).toBeGreaterThan(vsAxes.defense * 1.2);
  expect(W.battleNumbers(atk, knights, def, "forest").attack).toBeCloseTo(vsKnights.attack * 0.75);
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
  // camp 1 defense 80 ^ 0.65 ≈ 17 XP, all for the spearmen
  expect(report.attackerXp?.spearman).toBe(17);
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

test("XP is shared by contribution and a wiped-out regiment loses all of its XP", () => {
  const s = withBarracks(3);
  s.buildings.stable = 1;
  s.army = { spearman: 10, archer: 0, cavalry: 10, ram: 0 };
  const xp = W.battleXp(s, s.army, 1000, true, "attack");
  // spears 12×10 vs cavalry 40×10 → 120:400 of 1000 ^ 0.65 ≈ 89 XP
  expect(xp.spearman).toBe(21);
  expect(xp.cavalry).toBe(69);

  const t = withBarracks();
  t.army.spearman = 2;
  t.troops.spearman.xp = 1000;
  const { state } = W.raidCamp(t, 1, { ...E.emptyArmy(), spearman: 2 }, T0, 0.5);
  // all 2 died: no one is left to carry the experience, so it is all gone
  expect(state.troops.spearman.xp).toBe(0);
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
  // the defenders fought well but all fell, so their regiment keeps nothing
  expect(defAfter.troops.spearman.xp).toBe(0);

  const atkAfter = W.receiveRaidReport(d.state, report, "Def", T0, 0.3);
  expect(atkAfter.troops.spearman.xp).toBeGreaterThan(0);
});


test("states saved before ranks existed still work everywhere", () => {
  const old = E.createInitialState(T0) as any;
  delete old.troops;
  old.army.spearman = 10;
  const s = E.advance(old, T0 + 1000);
  expect(W.powerScore(s)).toBeGreaterThan(0);
  expect(W.defensePower(s)).toBeGreaterThan(0);
  expect(E.normalizeState(old).troops.spearman).toEqual({ xp: 0 });
});

test("only the troop types that fought gain rank", () => {
  const s = withBarracks(3);
  s.army = { ...E.emptyArmy(), spearman: 50, archer: 50 };
  const { state } = W.raidCamp(s, 1, { ...E.emptyArmy(), spearman: 50 }, T0, 0.5);
  expect(state.troops.spearman.xp).toBeGreaterThan(0);
  expect(state.troops.archer.xp).toBe(0);
});

test("old saves with Arsenal upgrades load without them", () => {
  const old = E.createInitialState(T0) as any;
  old.troops.spearman = { xp: 500, level: 4 };
  old.forge = { unit: "archer", toLevel: 1, startedAt: T0, endsAt: T0 + 1000 };
  const s = E.normalizeState(old) as any;
  expect(s.forge).toBeUndefined();
  expect(s.troops.spearman).toEqual({ xp: 500 });
  expect(E.unitMultiplier(s, "spearman")).toBeCloseTo(1.08); // Veteran, no upgrade bonus
});

test("cancelling a running batch keeps trained units, refunds the rest and moves the queue up", () => {
  let s = W.trainTroops(withBarracks(), "spearman", 10, T0); // 20s each
  s = W.trainTroops(s, "spearman", 2, T0);
  const now = T0 + 20_000 * 4 + 500;
  s = E.advance(s, now);
  expect(s.army.spearman).toBe(4);
  const wood = s.resources.wood;

  s = W.cancelTraining(s, T0, now);
  expect(s.army.spearman).toBe(4);
  expect(s.resources.wood).toBe(wood + 43 * 6);
  expect(s.training.length).toBe(1);
  expect(s.training[0].startsAt).toBe(now);
});

test("cancelling a queued batch leaves the running one alone", () => {
  let s = W.trainTroops(withBarracks(), "spearman", 2, T0);
  s = W.trainTroops(s, "spearman", 2, T0);
  s = W.trainTroops(s, "spearman", 2, T0);
  s = W.cancelTraining(s, T0 + 40_000, T0 + 1000);
  expect(s.training.map((t) => t.startsAt)).toEqual([T0, T0 + 40_000]);
  expect(() => W.cancelTraining(s, 123, T0)).toThrow("already finished");
});

test("a won raid knocks the City Gate down: a level for an empty tribe, more with rams", () => {
  expect(W.gateDamage(0, E.emptyArmy())).toBe(0);
  expect(W.gateDamage(11, E.emptyArmy())).toBe(1);
  expect(W.gateDamage(11, { ...E.emptyArmy(), ram: 25 })).toBe(2);
  expect(W.gateDamage(11, { ...E.emptyArmy(), ram: 55 })).toBe(3); // half the gate's levels broken
  expect(W.gateDamage(11, { ...E.emptyArmy(), ram: 500 })).toBe(6);
  expect(W.gateDamage(1, { ...E.emptyArmy(), ram: 500 })).toBe(1);

  const attacker = withBarracks();
  attacker.army.cavalry = 100;
  const defender = withBarracks();
  defender.shieldUntil = 0;
  defender.buildings["city-gate"] = 11;
  defender.queue = [{ building: "city-gate", toLevel: 12, startedAt: T0, endsAt: T0 + 1000 }];
  const { state, report } = W.defendRaid(defender, attacker, { ...E.emptyArmy(), cavalry: 100 }, T0, 0.5);

  expect(report.attackerWon).toBe(true);
  expect(report.gate).toEqual({ from: 11, to: 10 });
  expect(state.buildings["city-gate"]).toBe(10);
  expect(state.queue[0].toLevel).toBe(11);

  // Held: the gate stands.
  const strong = withBarracks();
  strong.shieldUntil = 0;
  strong.army.spearman = 500;
  strong.buildings["city-gate"] = 11;
  const held = W.defendRaid(strong, attacker, { ...E.emptyArmy(), cavalry: 1 }, T0, 0.5);
  expect(held.report.attackerWon).toBe(false);
  expect(held.report.gate).toBeUndefined();
  expect(held.state.buildings["city-gate"]).toBe(11);
});

test("the Hospital saves only the wounded, never the killed", () => {
  const attacker = withBarracks();
  attacker.buildings["hospital"] = 20; // the most it heals: half of the wounded
  attacker.army.cavalry = 1000;
  const defender = withBarracks();
  defender.shieldUntil = 0;
  defender.army.spearman = 300;
  const { report } = W.defendRaid(defender, attacker, { ...E.emptyArmy(), cavalry: 1000 }, T0, 0.5);
  const fallen = report.attackerLosses.cavalry + report.attackerHealed.cavalry;

  expect(report.attackerWon).toBe(true);
  expect(fallen).toBeGreaterThan(0);
  // Of the fallen, at most the wounded share can be treated, and half of those at best.
  expect(report.attackerHealed.cavalry).toBeLessThanOrEqual(Math.floor(Math.round(fallen * W.WOUNDED_SHARE.won) * 0.5));
  expect(report.attackerHealed.cavalry).toBeGreaterThan(0);
});

test("a won raid that takes nothing says why", () => {
  const attacker = withBarracks();
  attacker.army.cavalry = 100;
  const defender = withBarracks();
  defender.shieldUntil = 0;
  defender.buildings["hideout"] = 40;
  // Under the Hideout's cap (40% of the warehouse), so all of it is hidden.
  for (const r of ["iron", "wood", "clay", "crop"] as const) defender.resources[r] = 3000;
  const { report } = W.defendRaid(defender, attacker, { ...E.emptyArmy(), cavalry: 100 }, T0, 0.5);

  expect(report.attackerWon).toBe(true);
  expect(Object.values(report.loot).every((v) => v === 0)).toBe(true);
  expect(report.noLoot).toBe("hidden");
});


// ─── Balance pass ────────────────────────────────────────────────────────────

test("the Trapmaker's traps catch attackers before the battle, up to a quarter", () => {
  const attacker = withBarracks();
  attacker.army.cavalry = 1000;
  const defender = withBarracks();
  defender.shieldUntil = 0;
  defender.buildings["trapmaker"] = 4; // 5%
  const { outcome } = W.raidOutcome(defender, attacker, { ...E.emptyArmy(), cavalry: 1000 }, 0.5);

  expect(outcome.attackerTrapped?.cavalry).toBe(50);
  expect(outcome.attackerLosses.cavalry).toBeGreaterThanOrEqual(50);
  defender.buildings["trapmaker"] = 20;
  expect(E.getRates(defender).trapShare).toBe(0.25);
});

test("raided hard again within a day, the shield grows: 2 h, 6 h, 12 h, then stops at a day's worth", () => {
  const attacker = withBarracks();
  attacker.army.cavalry = 1200;
  let defender = withBarracks();
  const shields: number[] = [];

  for (let i = 0; i < 4; i++) {
    defender.shieldUntil = 0;
    defender.resources = { iron: 14000, wood: 14000, clay: 14000, crop: 14000 };
    // Each raid carries off half the stores: a heavy hit, worth the full step.
    const r = W.defendRaid(defender, attacker, { ...E.emptyArmy(), cavalry: 300 }, T0 + i * 3600e3, 0.5);

    expect(r.report.attackerWon).toBe(true);
    expect(r.report.damage).toBeGreaterThanOrEqual(C.RAID_SHIELD.fullDamage);
    shields.push(r.report.shieldMs! / 3600e3);
    defender = r.state;
  }
  // 2 + 6 + 12 = 20 h already given today, so the fourth only gets the 4 h left of the day's 24 h.
  expect(shields).toEqual([2, 6, 12, 4]);
  // A day later the ladder starts again.
  defender.shieldUntil = 0;
  defender.resources = { iron: 14000, wood: 14000, clay: 14000, crop: 14000 };
  const later = W.defendRaid(defender, attacker, { ...E.emptyArmy(), cavalry: 300 }, T0 + 30 * 3600e3, 0.5);
  expect(later.report.shieldMs).toBe(2 * 3600e3);
});

test("attacking your own second account with a few troops gives it no shield", () => {
  const main = withBarracks();
  main.army.spearman = 10;
  // The alt has full stores and some defenders.
  const alt = withBarracks();
  alt.shieldUntil = 0;
  alt.army.spearman = 50;

  // Lose on purpose: one spearman against fifty.
  const lost = W.defendRaid(alt, main, { ...E.emptyArmy(), spearman: 1 }, T0, 0.5);
  expect(lost.report.attackerWon).toBe(false);
  expect(lost.report.shieldMs).toBe(0);
  expect(lost.state.shieldUntil).toBe(0);
  expect(lost.state.war.raidShields ?? []).toEqual([]);

  // Or win against an undefended village and carry off a token amount (20 riders carry ~2,000 of 56,000).
  main.army.cavalry = 20;
  const open = withBarracks();
  open.shieldUntil = 0;
  const won = W.defendRaid(open, main, { ...E.emptyArmy(), cavalry: 20 }, T0, 0.5);
  expect(won.report.attackerWon).toBe(true);
  expect(won.report.shieldMs).toBe(0);
  expect(won.state.shieldUntil).toBe(0);
});

test("the raid shield is scaled by how hard the raid hit", () => {
  const attacker = withBarracks();
  attacker.army.cavalry = 1000;
  const hit = (cavalry: number) => {
    const d = withBarracks();
    d.shieldUntil = 0;
    return W.defendRaid(d, attacker, { ...E.emptyArmy(), cavalry }, T0, 0.5).report;
  };
  const small = hit(56); // ~5,600 of 56,000: 10%
  const big = hit(300); // half the stores

  expect(small.damage!).toBeGreaterThan(C.RAID_SHIELD.minDamage);
  expect(small.damage!).toBeLessThan(C.RAID_SHIELD.fullDamage);
  expect(small.shieldMs!).toBeGreaterThan(0);
  expect(small.shieldMs!).toBeLessThan(big.shieldMs!);
  expect(small.shieldMs! % C.RAID_SHIELD.stepMs).toBe(0);
  expect(big.shieldMs).toBe(C.RAIDED_SHIELDS_MS[0]);
});

test("an alt that empties its stores first can't earn a full shield by losing a handful", () => {
  const main = withBarracks();
  main.army.cavalry = 300;
  const alt = withBarracks();
  alt.shieldUntil = 0;
  alt.resources = { iron: 30, wood: 30, clay: 30, crop: 30 };

  const r = W.defendRaid(alt, main, { ...E.emptyArmy(), cavalry: 300 }, T0, 0.5);
  // Half of almost nothing is taken: measured against half a day of its own production, that's no real hit.
  expect(r.report.attackerWon).toBe(true);
  expect(r.report.shieldMs!).toBeLessThan(C.RAIDED_SHIELDS_MS[0]);
});

test("old saves keep their raids on the shield ladder", () => {
  const s0 = withBarracks();
  const old = { ...s0, war: { ...s0.war, raidedAt: [T0 - 3600e3, T0 - 1800e3] } } as unknown as E.GameState;
  const s = E.normalizeState(old);

  expect(s.war.raidShields).toEqual([[T0 - 3600e3, 2 * 3600e3], [T0 - 1800e3, 6 * 3600e3]]);
  expect("raidedAt" in s.war).toBe(false);
});

test("raiding a tribe under half your power takes half the loot", () => {
  const strong = withBarracks();
  strong.army.cavalry = 2000;
  const target = () => {
    const d = withBarracks();
    d.shieldUntil = 0;
    for (const r of ["iron", "wood", "clay", "crop"] as const) d.resources[r] = 10000;
    return d;
  };
  const weak = W.defendRaid(target(), strong, { ...E.emptyArmy(), cavalry: 1000 }, T0, 0.5).report;
  // A tribe built up to about the raider's power (buildings count towards it), but with no army home.
  const built = target();
  built.buildings["treasury"] = 10000;
  const even = W.defendRaid(built, strong, { ...E.emptyArmy(), cavalry: 1000 }, T0, 0.5).report;
  const total = (l: Record<string, number>) => Object.values(l).reduce((a, b) => a + b, 0);

  expect(weak.weakTarget).toBe(true);
  expect(even.weakTarget).toBeUndefined();
  expect(total(weak.loot)).toBeLessThan(total(even.loot));
});

test("the Hideout never hides more than a quarter of the warehouse", () => {
  const s = withBarracks();
  s.buildings["hideout"] = 60;
  const r = E.getRates(s);
  expect(r.hidden).toBe(Math.round(r.capacity * 0.25));
});

// ─── The dragon ──────────────────────────────────────────────────────────────

const withRoost = (lvl = 1) => {
  const s = withBarracks();
  s.buildings["dragon-roost"] = lvl;
  for (const r of ["iron", "wood", "clay", "crop"] as const) s.resources[r] = 500000;
  return s;
};

test("one dragon per tribe, counted from the moment it's ordered", () => {
  const s = W.trainTroops(withRoost(), "dragon", 1, T0);

  expect(() => W.trainTroops(s, "dragon", 1, T0)).toThrow("only 1");
  // Out on the march it isn't home or in the marches home, but it's still yours.
  const away = { ...s, training: [], army: { ...s.army, dragon: 0 } };
  expect(() => W.trainTroops(away, "dragon", 1, T0)).toThrow("only 1");
  // Cancelled before it hatched: you may order it again.
  const cancelled = W.cancelTraining(s, s.training[0].startsAt, T0);
  expect(W.trainTroops(cancelled, "dragon", 1, T0).training).toHaveLength(1);
  // Needs the Roost.
  expect(() => W.trainTroops(withBarracks(), "dragon", 1, T0)).toThrow("Dragon Roost");
});

test("the Roost makes the dragon stronger every level, up to its top", () => {
  expect(W.unitAttack(withRoost(1), "dragon")).toBe(4000);
  expect(W.unitAttack(withRoost(10), "dragon")).toBeCloseTo(4000 * 2.35);
  expect(W.unitAttack(withRoost(15), "dragon")).toBeCloseTo(4000 * 2.35);
});

test("a dragon flies straight: no ships, no road, no bandits", () => {
  const d = { ...E.emptyArmy(), dragon: 1 };
  const mixed = { ...d, axeman: 10 };

  expect(M.isFlight(d)).toBe(true);
  expect(M.isFlight(mixed)).toBe(false);
  expect(M.shipsNeeded(d)).toBe(0);
  const r = M.routeFor(d, { x: 0, y: 0 }, { x: 30, y: 40 });
  expect(r.naval).toBe(false);
  expect(r.distance).toBe(50);
  expect(M.routeMs(d, { x: 0, y: 0 }, { x: 30, y: 40 })).toBe(50 * 4 * 1000);
});

test("a beaten dragon isn't lost: it comes home wounded and rests", () => {
  const attacker = withRoost();
  attacker.army.dragon = 1;
  const defender = withBarracks();
  defender.shieldUntil = 0;
  defender.army.archer = 3000; // archers shoot it down
  const { report } = W.defendRaid(defender, attacker, { ...E.emptyArmy(), dragon: 1 }, T0, 0.5);

  expect(report.attackerWon).toBe(false);
  expect(report.attackerLosses.dragon).toBe(0);
  const home = W.receiveRaidReport(attacker, report, "x", T0, 0.5);
  expect(home.dragonRestUntil).toBe(report.returnsAt + 12 * 3600e3);
  // Resting, it can't be sent.
  const rested = { ...home, army: { ...home.army, dragon: 1 }, updatedAt: report.returnsAt + 3600e3 };
  expect(() => W.dispatchRaid(rested, { ...E.emptyArmy(), dragon: 1 }, rested.updatedAt)).toThrow("resting");
});

test("archers defend far better against a dragon than against an army as strong", () => {
  const attacker = withRoost();
  const defender = withBarracks();
  defender.army.archer = 200;
  const vsDragon = W.battleNumbers(attacker, { ...E.emptyArmy(), dragon: 1 }, defender).defense;
  const vsHorse = W.battleNumbers(attacker, { ...E.emptyArmy(), cavalry: 100 }, defender).defense; // same attack
  const vsAxes = W.battleNumbers(attacker, { ...E.emptyArmy(), axeman: 89 }, defender).defense;

  expect(vsDragon).toBeGreaterThan(vsHorse * 2.5);
  expect(vsDragon).toBeGreaterThan(vsAxes * 1.6); // archers hold foot soldiers well too
});

test("the dead take their share of a regiment's experience", () => {
  const s = E.createInitialState(T0);
  const empty = () => Object.fromEntries(Object.keys(s.troops).map((u) => [u, 0])) as any;
  s.troops.spearman.xp = 1000;
  s.troops.archer.xp = 1000;
  const regiment = { ...empty(), spearman: 100, archer: 50 };
  const dead = { ...empty(), spearman: 40, archer: 50 };
  const earned = { ...empty(), spearman: 10, archer: 10 };
  W.applyBattleXp(s, regiment, dead, earned);
  expect(s.troops.spearman.xp).toBe(610); // 40% died → 40% of XP lost, then +10
  expect(s.troops.archer.xp).toBe(0); // all died → all XP lost, nothing earned
});

test("a beaten dragon loses a fifth of its XP and learns nothing; a winning one grows as before", () => {
  const s = E.createInitialState(T0);
  const empty = () => Object.fromEntries(Object.keys(s.troops).map((u) => [u, 0])) as any;
  const regiment = { ...empty(), dragon: 1, knight: 100 };
  const dead = { ...empty(), knight: 50 };
  const earned = { ...empty(), dragon: 500, knight: 100 };

  s.troops.dragon.xp = 12_000; // Legend
  s.troops.knight.xp = 1000;
  W.applyBattleXp(s, regiment, dead, earned, true);
  expect(s.troops.dragon.xp).toBe(9_600); // −20%, no XP from the defeat: down to Champion
  expect(E.rankForXp(s.troops.dragon.xp)).toBeLessThan(E.rankForXp(12_000));
  expect(s.troops.knight.xp).toBe(600); // other troops: unchanged rule
  W.applyBattleXp(s, regiment, empty(), earned, false);
  expect(s.troops.dragon.xp).toBe(10_100);
  // A dragon that wasn't in the battle keeps its XP.
  W.applyBattleXp(s, { ...empty(), knight: 10 }, empty(), empty(), true);
  expect(s.troops.dragon.xp).toBe(10_100);
});

// ─── Troop roles (Nov 2026 rebalance) ─────────────────────────────────────────

const fighters = C.UNITS.filter((u) => !u.transport && !u.flying && !u.wallBreak && !u.towerBreak);
const price = (u: C.UnitDef) => C.RESOURCE_IDS.reduce((a, r) => a + u.cost[r], 0);
const best = (by: (u: C.UnitDef) => number) => [...fighters].sort((a, b) => by(b) - by(a))[0].id;

test("each troop is the best at its own job", () => {
  expect(best((u) => u.attack / price(u))).toBe("knight");
  expect(best((u) => u.attack / u.time)).toBe("knight");
  expect(best((u) => u.attack / u.upkeep)).toBe("axeman");
  expect(best((u) => u.defense / price(u))).toBe("spearman");
  expect(best((u) => u.defense / u.upkeep)).toBe("paladin");
  expect(best((u) => u.carry)).toBe("cavalry");
  expect(best((u) => -u.speed)).toBe("cavalry");
  // Of the foot soldiers, the Swordsman is the one good at both.
  const foot = fighters.filter((u) => !u.mounted);
  expect([...foot].sort((a, b) => Math.min(b.attack, b.defense) - Math.min(a.attack, a.defense))[0].id).toBe("swordsman");
});

test("archers hold foot soldiers, spearmen hold horsemen", () => {
  const atk = withBarracks();
  const bows = withBarracks();
  bows.army.archer = 200;
  const spears = withBarracks();
  spears.army.spearman = 182; // about the same plain defense as the archers
  const foot = { ...E.emptyArmy(), axeman: 100 };
  const horse = { ...E.emptyArmy(), cavalry: 112 }; // same attack as the axemen

  expect(W.battleNumbers(atk, foot, bows).defense).toBeGreaterThan(W.battleNumbers(atk, foot, spears).defense * 1.3);
  expect(W.battleNumbers(atk, horse, spears).defense).toBeGreaterThan(W.battleNumbers(atk, horse, bows).defense * 1.3);
  // Siege engines aren't foot soldiers: archers get nothing extra against them.
  const rams = { ...E.emptyArmy(), ram: 10 };
  expect(W.battleNumbers(atk, rams, bows).defense).toBeCloseTo(W.defensePower(bows, rams));
});

test("the dragon's fire breaks half of any gate and tower, whatever their level", () => {
  const d = withBarracks();
  d.buildings["city-gate"] = 20;
  const dragon = { ...E.emptyArmy(), dragon: 1 };
  expect((W.defensePower(d, dragon) / 1.3) * 1.6).toBeCloseTo(W.defensePower(d));
});

test("the militia stops growing at MILITIA_MAX", () => {
  expect(C.militiaDefense(0)).toBe(50);
  expect(C.militiaDefense(1000)).toBe(150);
  expect(C.militiaDefense(1e7)).toBe(C.MILITIA_MAX);
});

// ─── Whole-game audit (Nov 2026) ──────────────────────────────────────────────

test("farming beaten camps pays at most a few hours of your own production", () => {
  const s = withBarracks();
  s.camps.cleared = 30;
  const first = C.campFirstReward(30).resources;
  const repeat = W.campReward(s, 30).resources;
  const p = E.getRates(s).productionPerHour;
  expect(repeat).toBeLessThanOrEqual(((p.iron + p.wood + p.clay) / 3) * C.CAMP_REPEAT_HOURS + 1);
  expect(repeat).toBeLessThan(first * C.CAMP_REPEAT_SHARE);
  // A new camp still pays its full first reward.
  expect(W.campReward(s, 31).resources).toBe(C.campFirstReward(31).resources);
  // All the camps a tribe keeps, raided as often as they come back, at most double its income.
  const perDay = C.CAMPS_KEPT * (24 * 3600e3 / C.CAMP_REPEAT_COOLDOWN_MS) * C.CAMP_REPEAT_HOURS;
  expect(perDay).toBeLessThanOrEqual(24);
});

test("ranks come slowly: a big late battle is worth far less XP than its size", () => {
  const s = withBarracks();
  const fought = { ...E.emptyArmy(), axeman: 100 };
  const xp = (enemy: number) => W.battleXp(s, fought, enemy, true, "attack").axeman;
  // Camp 20 is 300× camp 1's strength but gives ~40× the XP.
  expect(xp(C.campDefense(20)) / xp(C.campDefense(1))).toBeLessThan(50);
  // Legend takes a dozen wins at camp 20, where it used to take two.
  expect(C.RANKS[C.MAX_RANK].xp / xp(C.campDefense(20))).toBeGreaterThan(10);
  // A camp beaten before teaches less than the first time.
  const t = withBarracks(5);
  t.army.axeman = 400;
  t.camps.cleared = 10;
  const repeat = W.raidCamp(t, 10, { ...E.emptyArmy(), axeman: 400 }, T0, 0.5).report.attackerXp!.axeman;
  const first = W.raidCamp(t, 11, { ...E.emptyArmy(), axeman: 400 }, T0, 0.5).report.attackerXp!.axeman;
  expect(repeat).toBeLessThan(first * 0.4);
});

test("soldiers are recruited from the tribe's people, and come back if training is cancelled", () => {
  let s = withBarracks();
  s.population = 30;
  expect(() => W.trainTroops(s, "spearman", 31, T0)).toThrow("Not enough people");
  const before = E.peopleOf(s);
  s = W.trainTroops(s, "spearman", 20, T0);
  expect(s.population).toBe(10);
  // Training doesn't lower the tribe's total: they're soldiers now.
  expect(E.peopleOf(s)).toBe(before);
  s = W.cancelTraining(s, T0, T0);
  expect(s.population).toBe(30);
  // Bigger troops need more men: a knight takes 3.
  expect(C.unitPeople(C.UNIT_BY_ID.knight)).toBe(3);
  expect(C.unitPeople(C.UNIT_BY_ID.dragon)).toBe(0);
});

test("soldiers lost in battle are people lost from the tribe", () => {
  const s = withBarracks();
  s.army.spearman = 2;
  const before = E.peopleOf(s);
  const { state } = W.raidCamp(s, 1, { ...E.emptyArmy(), spearman: 2 }, T0, 0.5); // 24 attack vs 80: all fall
  expect(E.peopleOf(state)).toBe(before - 2);
});

test("raid shields stay inside the ladder and the day's cap, whatever the damage", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let run = 0; run < 2000; run++) {
    const recent: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const damage = rnd();
      const ms = W.raidShieldMs(damage, recent);
      const step = C.RAIDED_SHIELDS_MS[Math.min(C.RAIDED_SHIELDS_MS.length - 1, recent.length)];

      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(step);
      if (damage < C.RAID_SHIELD.minDamage) expect(ms).toBe(0);
      if (ms > 0) recent.push([i, ms]);
      expect(recent.reduce((a, [, x]) => a + x, 0)).toBeLessThanOrEqual(C.RAID_SHIELD.dailyMaxMs);
    }
  }
});
