/**
 * Whole-game pacing: simulated players run on the real engine for months of
 * game time, so a change anywhere in the economy (costs, build times,
 * production, troops) that breaks the pace of the game fails here.
 *
 * - The builder plays perfectly for its village: every 15 minutes it starts
 *   the advised upgrade on every free builder, and trains nothing. It's the
 *   fastest a village can be finished.
 * - The warlord does the same but spends what piles up past 60% of storage on
 *   troops. Buildings want resources in their own mix (walls are brick, ships
 *   timber), so some always pile up while the village waits for another:
 *   that surplus is the army, and it doesn't slow the village down.
 */
import { expect, test } from "bun:test";

import * as A from "./advice";
import * as C from "./config";
import * as E from "./engine";
import * as W from "./war";

const DAY = 86400e3;
const STEP = 15 * 60e3;

type Marks = Partial<Record<"hall5" | "hall10" | "hall20" | "maxed", number>>;

function play(days: number, army: boolean) {
  let s = E.createInitialState(0);
  const marks: Marks = {};

  for (let t = 0; t < days * DAY; t += STEP) {
    s = E.advance(s, t);
    for (let i = 0; i < 4; i++) {
      const pick = A.recommendUpgrade(s);
      if (!pick) break;
      s = E.upgradeBuilding(s, pick.id, t);
    }
    if (army && s.training.length < E.maxTrainBatches(s)) {
      const unit: C.UnitId = W.unitUnlocked(s, "axeman") ? "axeman" : "spearman";
      const cap = E.getRates(s).capacity;
      const u = C.UNIT_BY_ID[unit];
      const n = Math.min(C.MAX_BATCH, ...C.RESOURCE_IDS.map((r) => Math.floor((s.resources[r] - cap * 0.6) / u.cost[r])));
      // Keep crop growing: never train past what the fields feed.
      const fed = Math.floor(E.getRates(s).productionPerHour.crop / u.upkeep) - 50;
      if (W.unitUnlocked(s, unit) && Math.min(n, fed) > 0) s = W.trainTroops(s, unit, Math.min(n, fed), t);
    }
    const hall = s.buildings["town-hall"];
    if (hall >= 5) marks.hall5 ??= t / DAY;
    if (hall >= 10) marks.hall10 ??= t / DAY;
    if (hall >= 20) marks.hall20 ??= t / DAY;
    if (C.BUILDINGS.every((b) => s.buildings[b.id] >= b.maxLevel)) {
      marks.maxed ??= t / DAY;
      if (!army) break;
    }
  }
  return { state: s, marks };
}

test("the builder: Town Hall 10 in about two weeks, a finished village in about four months", () => {
  const { marks } = play(250, false);

  expect(marks.hall5).toBeGreaterThan(2);
  expect(marks.hall5).toBeLessThan(8);
  expect(marks.hall10).toBeGreaterThan(7);
  expect(marks.hall10).toBeLessThan(21);
  expect(marks.hall20).toBeGreaterThan(60);
  expect(marks.maxed).toBeGreaterThan(90);
  expect(marks.maxed).toBeLessThan(160);
}, 120_000);

test("the warlord: the surplus becomes an army the fields can feed", () => {
  const builder = play(250, false).marks;
  const { state, marks } = play(250, true);

  expect(marks.maxed ?? Infinity).toBeGreaterThanOrEqual(builder.maxed!);
  const troops = W.armySize(E.totalArmy(state));
  expect(troops).toBeGreaterThan(5000);
  expect(E.getRates(state).productionPerHour.crop).toBeGreaterThan(0);
  // The late camps stay a goal: by then the army takes camp 30 but not camp 45.
  const power = W.attackPower(state, E.totalArmy(state));
  expect(power).toBeGreaterThan(C.campDefense(30));
  expect(power).toBeLessThan(C.campDefense(45));
}, 120_000);
