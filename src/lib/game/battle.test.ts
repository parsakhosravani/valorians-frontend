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
