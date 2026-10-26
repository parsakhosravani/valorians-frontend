import { test, expect } from "bun:test";

import * as E from "./engine";
import { trainTroops } from "./war";
import { PLUS, MAX_TRAIN_BATCHES } from "./config";

const T0 = Date.UTC(2026, 9, 26, 10);
const DAY = 86400e3;

test("old saves get Plus off", () => {
  const { plus: _plus, ...old } = E.createInitialState(T0);
  const s = E.normalizeState(old as E.GameState);

  expect(s.plus).toEqual({ until: 0, trialUsed: false, paid: false });
  expect(E.plusActive(s)).toBe(false);
});

test("trial adds a builder, runs out, and only once", () => {
  let s = E.createInitialState(T0);
  const base = E.getRates(s).builders;

  s = E.startPlusTrial(s, T0);
  expect(E.plusActive(s)).toBe(true);
  expect(E.getRates(s).builders).toBe(base + PLUS.extraBuilders);
  // Two buildings at once with only a free builder plus the Plus one.
  s = E.upgradeBuilding(s, "iron-mine", T0);
  s = E.upgradeBuilding(s, "sawmill", T0);
  expect(s.queue.length).toBe(2);
  expect(() => E.startPlusTrial(s, T0 + 1)).toThrow();

  const later = E.advance(s, T0 + PLUS.trialMs + 1);
  expect(E.plusActive(later)).toBe(false);
  expect(E.getRates(later).builders).toBe(base);
  expect(() => E.startPlusTrial(later, T0 + PLUS.trialMs + 1)).toThrow("already used");
});

test("training queue grows with Plus", () => {
  let s = E.createInitialState(T0);
  s.buildings["barracks"] = 1;
  s.resources = { iron: 1e6, wood: 1e6, clay: 1e6, crop: 1e6 };
  expect(E.maxTrainBatches(s)).toBe(MAX_TRAIN_BATCHES);
  for (let i = 0; i < MAX_TRAIN_BATCHES; i++) s = trainTroops(s, "spearman", 1, T0);
  expect(() => trainTroops(s, "spearman", 1, T0)).toThrow("Training queue is full");
  s = E.startPlusTrial(s, T0);
  expect(E.maxTrainBatches(s)).toBe(MAX_TRAIN_BATCHES + PLUS.extraTrainBatches);
  s = trainTroops(s, "spearman", 1, T0);
  expect(s.training.length).toBe(MAX_TRAIN_BATCHES + 1);
});

test("payments extend to Telegram's date and never shorten Plus", () => {
  let s = E.createInitialState(T0);
  s = E.startPlusTrial(s, T0);
  s = E.grantPlus(s, T0 + DAY, T0 + 31 * DAY);
  expect(s.plus).toEqual({ until: T0 + 31 * DAY, trialUsed: true, paid: true });
  // A renewal reported early or with no date still adds a full month.
  const renewed = E.grantPlus(s, T0 + 30 * DAY);
  expect(renewed.plus.until).toBe(T0 + 31 * DAY + PLUS.periodMs);
  const stale = E.grantPlus(renewed, T0 + 30 * DAY, T0 + 31 * DAY);
  expect(stale.plus.until).toBe(renewed.plus.until);
});
