import { expect, test } from "bun:test";

import * as B from "./battle";
import * as E from "./engine";
import * as W from "./war";
import { BATTLE_MAX_MS, BATTLE_MAX_ROUNDS, BATTLE_MIN_MS, BATTLE_MIN_ROUNDS } from "./config";

const T0 = Date.UTC(2026, 9, 26, 10);

const tribe = () => {
  const s = E.createInitialState(T0);
  s.buildings.barracks = 1;
  s.shieldUntil = 0;
  s.resources = { iron: 10000, wood: 10000, clay: 10000, crop: 10000 };
  return s;
};

test("bigger battles last longer, within limits", () => {
  expect(B.battleDurationMs(0)).toBe(BATTLE_MIN_MS);
  expect(B.battleDurationMs(5)).toBe(BATTLE_MIN_MS);
  const d100 = B.battleDurationMs(100);
  const d1000 = B.battleDurationMs(1000);
  expect(d100).toBeGreaterThan(BATTLE_MIN_MS);
  expect(d1000).toBeGreaterThan(d100);
  expect(B.battleDurationMs(1_000_000)).toBe(BATTLE_MAX_MS);

  expect(B.roundCount(BATTLE_MIN_MS)).toBe(BATTLE_MIN_ROUNDS);
  expect(B.roundCount(BATTLE_MAX_MS)).toBe(BATTLE_MAX_ROUNDS);
});

test("rounds add up to the decided result and only rise", () => {
  const attacker = tribe();
  const defender = tribe();
  defender.army.spearman = 120;
  const sent = { ...E.emptyArmy(), swordsman: 200 };

  for (const seed of [0, 0.3, 0.77]) {
    const { outcome, defenders } = W.raidOutcome(defender, attacker, sent, seed);
    const plan = B.planBattle(outcome, T0, B.troopsOnField(sent) + B.troopsOnField(defenders), seed);
    const last = plan.rounds[plan.rounds.length - 1];

    expect(plan.endsAt - plan.startedAt).toBe(B.battleDurationMs(320));
    expect(last.at).toBe(plan.endsAt - plan.startedAt);
    expect(last.attackerFallen.swordsman).toBe(outcome.attackerLosses.swordsman + outcome.attackerHealed.swordsman);
    expect(last.defenderFallen.spearman).toBe(outcome.defenderLosses.spearman + outcome.defenderHealed.spearman);
    // the loser is broken by the end
    expect(outcome.attackerWon ? last.defenseLeft : last.attackLeft).toBe(0);

    for (let i = 1; i < plan.rounds.length; i++) {
      const a = plan.rounds[i - 1];
      const b = plan.rounds[i];
      expect(b.at).toBeGreaterThan(a.at);
      expect(b.attackerFallen.swordsman).toBeGreaterThanOrEqual(a.attackerFallen.swordsman);
      expect(b.defenderFallen.spearman).toBeGreaterThanOrEqual(a.defenderFallen.spearman);
      expect(b.attackLeft).toBeLessThanOrEqual(a.attackLeft);
      expect(b.defenseLeft).toBeLessThanOrEqual(a.defenseLeft);
    }
  }
});

test("rounds stay secret until they're fought", () => {
  const s = tribe();
  const outcome = W.campOutcome(s, 1, { ...E.emptyArmy(), spearman: 50 }, 0.5);
  const plan = B.planBattle(outcome, T0, 54, 0.5);

  expect(B.roundsSoFar(plan, T0)).toHaveLength(0);
  expect(B.nextRoundAt(plan, T0)).toBe(T0 + plan.rounds[0].at);
  expect(B.roundsSoFar(plan, T0 + plan.rounds[1].at)).toHaveLength(2);
  expect(B.roundsSoFar(plan, plan.endsAt)).toHaveLength(plan.rounds.length);
  expect(B.nextRoundAt(plan, plan.endsAt)).toBeNull();
});

test("defenders leave home for the fight and survivors come back", () => {
  const attacker = tribe();
  attacker.army.swordsman = 30;
  const defender = tribe();
  defender.army.spearman = 60;

  const d = W.dispatchRaid(attacker, { ...E.emptyArmy(), swordsman: 30 }, T0);
  const { outcome, defenders } = W.raidOutcome(defender, d.state, d.sent, 0.5);
  const onField = W.engageDefenders(defender, defenders);
  expect(onField.army.spearman).toBe(0);

  // Ends later, against the defender's state at that time.
  const end = T0 + 120_000;
  const { state, report } = W.defendRaid(onField, d.state, d.sent, end, 0.9, { outcome, engaged: defenders });
  expect(report.attackerWon).toBe(outcome.attackerWon);
  expect(report.attack).toBe(outcome.attack);
  expect(state.army.spearman).toBe(60 - outcome.defenderLosses.spearman);
  expect(report.defenders.spearman).toBe(60);

  // Giving them back unharmed if the battle can't finish.
  expect(W.releaseDefenders(onField, defenders).army.spearman).toBe(60);
});

test("a battle already underway ends even if a shield went up meanwhile", () => {
  const attacker = tribe();
  const defender = tribe();
  const sent = { ...E.emptyArmy(), swordsman: 10 };
  const { outcome, defenders } = W.raidOutcome(defender, attacker, sent, 0.5);
  defender.shieldUntil = T0 + 3_600_000;

  expect(() => W.defendRaid(defender, attacker, sent, T0, 0.5)).toThrow("shield");
  expect(() => W.defendRaid(defender, attacker, sent, T0, 0.5, { outcome, engaged: defenders })).not.toThrow();
});

test("a camp battle applies the result decided on arrival", () => {
  const s = tribe();
  s.army.spearman = 50;
  const d = W.dispatchCamp(s, 1, { ...E.emptyArmy(), spearman: 50 }, T0);
  const outcome = W.campOutcome(d.state, 1, d.sent, 0.5);
  const end = T0 + 90_000;
  const { state, report } = W.campBattle(d.state, 1, d.sent, end, 0.1, { outcome, travelMs: 30_000 });

  expect(report.attackerWon).toBe(outcome.attackerWon);
  expect(report.returnsAt).toBe(end + 30_000);
  expect(state.camps.cleared).toBe(1);
});

test("a battle lasts by the smaller side: a big army on an empty village is over fast", () => {
  expect(B.battleSize(4800, 100)).toBe(200);
  expect(B.battleSize(50, 4800)).toBe(100);
  // 4,800 against an empty village worth ~100 troops: a few rounds, not ten.
  expect(B.roundCount(B.battleDurationMs(B.battleSize(4800, 100)))).toBeLessThan(B.roundCount(B.battleDurationMs(4800 + 100)));
  expect(B.roundCount(B.battleDurationMs(B.battleSize(4800, 0)))).toBe(3);
  // Two big armies still fight it out.
  expect(B.roundCount(B.battleDurationMs(B.battleSize(4800, 4000)))).toBe(10);
});

// ─── Armies coming home into a battle ────────────────────────────────────────

/** A raid on a weak village: the attackers win unless help comes. */
const siege = () => {
  const attacker = tribe();
  const defender = tribe();
  defender.army.spearman = 20;
  const sent = { ...E.emptyArmy(), swordsman: 300 };
  const { outcome, defenders } = W.raidOutcome(defender, attacker, sent, 0.5);
  const plan = B.planBattle(outcome, T0, B.battleSize(B.troopsOnField(sent), B.troopsOnField(defenders)), 0.4);
  return { attacker, defender, sent, battle: { plan, outcome, engaged: defenders } };
};

const sum = (a: E.Army, b: E.Army) => {
  const out = E.emptyArmy();
  for (const u of Object.keys(out) as (keyof E.Army)[]) out[u] = (a[u] ?? 0) + (b[u] ?? 0);
  return out;
};

test("an army coming home mid-battle joins from the next round and can turn it", () => {
  const { attacker, defender, sent, battle } = siege();
  expect(battle.outcome.attackerWon).toBe(true);
  const home = { ...E.emptyArmy(), spearman: 2000 };
  const arrive = battle.plan.startedAt + battle.plan.rounds[0].at + 1; // during round 2

  const next = B.reinforceBattle(defender, attacker, sent, battle, { at: arrive, units: home }, 0.2)!;
  expect(next).not.toBeNull();
  // Rounds 1–2 were already under way and don't change; they join in round 3.
  expect(next.plan.rounds.slice(0, 2)).toEqual(battle.plan.rounds.slice(0, 2));
  expect(next.plan.rounds[2].joined).toEqual(home);
  expect(next.plan.rounds.every((r, i) => r.n === i + 1)).toBe(true);
  expect(next.plan.endsAt).toBe(next.plan.startedAt + next.plan.rounds[next.plan.rounds.length - 1].at);
  // With them, the village holds.
  expect(next.outcome.attackerWon).toBe(false);
  expect(next.engaged).toEqual(sum(battle.engaged, home));
  // The last round adds up to the decided result, and nobody falls twice.
  const last = next.plan.rounds[next.plan.rounds.length - 1];
  expect(last.attackerFallen).toEqual(sum(next.outcome.attackerLosses, next.outcome.attackerHealed));
  expect(last.defenderFallen).toEqual(sum(next.outcome.defenderLosses, next.outcome.defenderHealed));
  for (const u of Object.keys(sent) as (keyof E.Army)[]) {
    expect(last.attackerFallen[u]).toBeLessThanOrEqual(sent[u]);
    expect(last.defenderFallen[u]).toBeLessThanOrEqual(next.engaged![u]);
  }
});

test("a second army of the attackers' side joins from the next round and can win it", () => {
  const attacker = tribe();
  const defender = tribe();
  defender.army.spearman = 400;
  const sent = { ...E.emptyArmy(), swordsman: 100 };
  const { outcome, defenders } = W.raidOutcome(defender, attacker, sent, 0.5);
  const plan = B.planBattle(outcome, T0, B.battleSize(B.troopsOnField(sent), B.troopsOnField(defenders)), 0.4);
  const battle = { plan, outcome, engaged: defenders };
  expect(outcome.attackerWon).toBe(false);
  const help = { ...E.emptyArmy(), axeman: 3000 };
  const next = B.reinforceAttack(defender, attacker, sent, battle, { at: plan.startedAt + 1, units: help }, 0.2)!;

  expect(next.plan.rounds[0]).toEqual(plan.rounds[0]); // the round under way doesn't change
  expect(next.plan.rounds[1].allied).toEqual(help);
  expect(next.outcome.attackerWon).toBe(true);
  expect(next.engaged).toEqual(battle.engaged); // the defenders on the field are the same
  // Nobody falls twice, and no attacker falls who wasn't there.
  const all = sum(sent, help);
  const last = next.plan.rounds[next.plan.rounds.length - 1];
  expect(last.attackerFallen).toEqual(sum(next.outcome.attackerLosses, next.outcome.attackerHealed));
  for (const u of Object.keys(all) as (keyof E.Army)[]) expect(last.attackerFallen[u]).toBeLessThanOrEqual(all[u]);
  // Too late: the last round has begun.
  expect(B.reinforceAttack(defender, attacker, sent, battle, { at: B.joinDeadline(plan) + 1, units: help }, 0.2)).toBeNull();
});

test("an army coming home in the last round is too late to join", () => {
  const { attacker, defender, sent, battle } = siege();
  const n = battle.plan.rounds.length;
  const deadline = B.joinDeadline(battle.plan);
  expect(deadline).toBe(battle.plan.startedAt + battle.plan.rounds[n - 2].at - 1);
  const units = { ...E.emptyArmy(), spearman: 50 };
  expect(B.reinforceBattle(defender, attacker, sent, battle, { at: deadline + 1, units }, 0.2)).toBeNull();
  expect(B.reinforceBattle(defender, attacker, sent, battle, { at: deadline, units }, 0.2)).not.toBeNull();
});

test("newcomers show on the field only once their round begins", () => {
  const { attacker, defender, sent, battle } = siege();
  const units = { ...E.emptyArmy(), spearman: 50 };
  const next = B.reinforceBattle(defender, attacker, sent, battle, { at: battle.plan.startedAt + 1, units }, 0.2)!;
  const joinsAt = next.plan.startedAt + next.plan.rounds[0].at;
  expect(B.defendersSoFar(next.plan, next.engaged, joinsAt - 1)).toEqual(battle.engaged);
  expect(B.defendersSoFar(next.plan, next.engaged, joinsAt)).toEqual(next.engaged);
});

test("a march home lands on the field while the village fights, and goes home after", () => {
  const s0 = tribe();
  s0.updatedAt = T0;
  const units = { ...E.emptyArmy(), spearman: 30 };
  const loot = { iron: 100, wood: 0, clay: 0, crop: 0 };
  s0.marches = [
    { id: "a", target: "x", units: { ...units }, loot: { ...loot }, coins: 5, returnsAt: T0 + 60_000 },
    { id: "b", target: "y", units: { ...units }, loot: { iron: 0, wood: 0, clay: 0, crop: 0 }, coins: 0, returnsAt: T0 + 600_000 },
  ];
  const s1 = W.holdField(s0, 7, T0 + 120_000);
  const iron = s1.resources.iron;
  const s2 = E.advance(s1, T0 + 700_000);

  // The first came home during the fight: on the field, spoils unloaded.
  expect(s2.joining).toEqual([{ id: 7, at: T0 + 60_000, units }]);
  expect(s2.resources.iron).toBeGreaterThanOrEqual(iron + 100);
  // The second came after the last round began: home as usual.
  expect(s2.army.spearman).toBe(30);

  const { state, joins } = W.takeJoining(s2, 7);
  expect(joins.length).toBe(1);
  expect(state.joining).toEqual([]);

  // A battle that ends sends anyone still waiting home.
  const done = W.leaveField(s2, 7);
  expect(done.army.spearman).toBe(60);
  expect(done.defending).toEqual([]);
});
