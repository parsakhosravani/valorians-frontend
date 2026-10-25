import { test, expect } from "bun:test";

import * as E from "./engine";
import * as W from "./war";
import { MIN_MARCH_SECONDS } from "./config";
import { campPosition, distance, homeSlot, marchMs, terrainAt } from "./map";

const T0 = Date.UTC(2026, 9, 25, 10);
const army = (a: Partial<E.Army>) => ({ ...E.emptyArmy(), ...a });

test("tribes settle on distinct dry land", () => {
  // Same as the server: try slot n, n+1, … until a free one turns up.
  const seen = new Set<string>();
  let n = 0;

  for (let i = 0; i < 300; i++) {
    let p = homeSlot(n);

    while (seen.has(`${p.x},${p.y}`)) p = homeSlot(++n);
    expect(terrainAt(p.x, p.y)).not.toBe("lake");
    seen.add(`${p.x},${p.y}`);
    n++;
  }
  expect(seen.size).toBe(300);
});

test("camps sit further out as they get harder", () => {
  const home = homeSlot(0);

  expect(distance(home, campPosition(7, 10, home))).toBeGreaterThan(distance(home, campPosition(7, 1, home)));
});

test("an army marches at its slowest unit", () => {
  expect(marchMs(army({ cavalry: 10 }), 10)).toBe(120_000);
  expect(marchMs(army({ cavalry: 10, ram: 1 }), 10)).toBe(450_000);
  expect(marchMs(army({ cavalry: 1 }), 0.5)).toBe(MIN_MARCH_SECONDS * 1000);
});

test("hills add defense, forests weaken cavalry", () => {
  const me = E.createInitialState(T0);
  const them = E.createInitialState(T0);
  const plains = W.battleNumbers(me, army({ cavalry: 10 }), them, "plains");
  const hills = W.battleNumbers(me, army({ cavalry: 10 }), them, "hills");
  const forest = W.battleNumbers(me, army({ cavalry: 10 }), them, "forest");

  expect(hills.defense).toBeCloseTo(plains.defense * 1.2, 5);
  expect(forest.attack).toBeCloseTo(plains.attack * 0.75, 5);
});

test("spearmen defend better against cavalry than against archers", () => {
  const me = E.createInitialState(T0);
  const them = E.createInitialState(T0);

  them.army.spearman = 100;
  const vsCav = W.battleNumbers(me, army({ cavalry: 10 }), them);
  const vsArch = W.battleNumbers(me, army({ archer: 20 }), them);

  expect(vsCav.defense).toBeGreaterThan(vsArch.defense);
});

test("camp battle brings survivors home after the march back", () => {
  let s = E.createInitialState(T0);

  s.army.spearman = 50;
  const d = W.dispatchCamp(s, 1, army({ spearman: 50 }), T0);

  expect(d.state.army.spearman).toBe(0);
  const arrive = T0 + 60_000;
  const r = W.campBattle(d.state, 1, d.sent, arrive, 0.5, { terrain: "plains", travelMs: 60_000, from: { x: 1, y: 1 } });

  expect(r.report.attackerWon).toBe(true);
  expect(r.state.marches[0].returnsAt).toBe(arrive + 60_000);
  expect(r.state.marches[0].from).toEqual({ x: 1, y: 1 });
  s = E.advance(r.state, arrive + 61_000);
  expect(s.army.spearman).toBeGreaterThan(40);
  expect(s.camps.cleared).toBe(1);
});
