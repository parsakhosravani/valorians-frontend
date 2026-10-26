import { test, expect } from "bun:test";

import * as E from "./engine";
import { dispatchRaid } from "./war";
import { PLUS, SHIELDS } from "./config";

const T0 = Date.UTC(2026, 9, 26, 10);
const H = 3600e3;

/** A player past the new-player shield. */
const veteran = () => ({ ...E.createInitialState(T0), shieldUntil: 0 });

test("old saves get an empty shield record", () => {
  const { shield: _shield, ...old } = E.createInitialState(T0);
  const s = E.normalizeState(old as E.GameState);

  expect(s.shield).toEqual({ cooldownUntil: 0, plusClaimedAt: 0 });
});

test("a bought shield protects, then cools down before the next one", () => {
  let s = E.raiseShield(veteran(), 24, T0);

  expect(s.shieldUntil).toBe(T0 + 24 * H);
  expect(s.shield.cooldownUntil).toBe(T0 + 24 * H + SHIELDS.cooldownMs);
  // No stacking while it runs, nor in the day after it ends.
  expect(() => E.raiseShield(s, 72, T0 + H)).toThrow("recharging");
  expect(() => E.raiseShield(s, 8, T0 + 30 * H)).toThrow("recharging");
  s = E.raiseShield(s, 8, T0 + 24 * H + SHIELDS.cooldownMs);
  expect(s.shieldUntil).toBe(T0 + 24 * H + SHIELDS.cooldownMs + 8 * H);
});

test("a shorter shield than the one you have is refused", () => {
  const fresh = E.createInitialState(T0); // 72h new-player shield

  expect(() => E.raiseShield(fresh, 8, T0)).toThrow("already shielded");
  expect(E.shieldBlocked(fresh, 8, T0)).toMatch(/already shielded/);
  expect(E.shieldBlocked(veteran(), 8, T0)).toBeNull();
});

test("attacking breaks a bought shield and starts the cooldown", () => {
  let s = veteran();
  s.army.spearman = 50;
  s = E.raiseShield(s, 72, T0);
  const { state } = dispatchRaid(s, { ...E.emptyArmy(), spearman: 10 }, T0 + 2 * H);

  expect(state.shieldUntil).toBe(T0 + 2 * H);
  expect(state.shield.cooldownUntil).toBe(T0 + 2 * H + SHIELDS.cooldownMs);
  expect(() => E.raiseShield(state, 8, T0 + 3 * H)).toThrow("recharging");
});

test("Plus gives one free shield a week", () => {
  let s = veteran();

  expect(() => E.claimPlusShield(s, T0)).toThrow("Valorians Plus");
  s = E.grantPlus(s, T0);
  s = E.claimPlusShield(s, T0);
  expect(s.shieldUntil).toBe(T0 + PLUS.weeklyShieldHours * H);
  // The cooldown is over by the next day, but the weekly one isn't back yet.
  const nextDay = E.advance(s, T0 + 2 * 86400e3);
  expect(() => E.claimPlusShield(nextDay, T0 + 2 * 86400e3)).toThrow("weekly shield is back");
  const nextWeek = E.advance(s, T0 + PLUS.weeklyShieldEveryMs);
  expect(E.claimPlusShield(nextWeek, T0 + PLUS.weeklyShieldEveryMs).shieldUntil).toBe(
    T0 + PLUS.weeklyShieldEveryMs + PLUS.weeklyShieldHours * H
  );
});
