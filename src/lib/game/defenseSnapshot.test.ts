import { expect, test } from "bun:test";

import * as E from "./engine";
import * as W from "./war";

const T0 = Date.UTC(2026, 9, 23, 10);
const HOUR = 3600_000;

/** A tribe with things under way: troops training, a building going up, an army on its way home. */
const busy = () => {
  let s = E.createInitialState(T0);

  s.buildings.barracks = 3;
  s.buildings.embassy = 4;
  s.buildings.armory = 2;
  s.army.spearman = 40;
  s.population = 1234.5;
  s.resources = { iron: 50000, wood: 50000, clay: 50000, crop: 50000 };
  s = W.trainTroops(s, "spearman", 20, T0);
  s = E.upgradeBuilding(s, "armory", T0);
  s.marches = [
    {
      id: "m1",
      target: "camp:1",
      units: { ...E.emptyArmy(), archer: 15 },
      loot: { iron: 0, wood: 0, clay: 0, crop: 0 },
      coins: 0,
      returnsAt: T0 + 3 * HOUR,
    },
  ];

  return s;
};

test("defenseAt matches defensePower of the advanced state until the next step", () => {
  const s = busy();
  const d = W.defenseSnapshot(s);

  // The first troop in training finishes first.
  expect(d.until).toBe(s.training[0].startsAt + s.training[0].perUnitMs);
  for (const t of [T0, T0 + 1, T0 + 777, d.until! - 1]) {
    expect(W.defenseAt(d, t)).toBe(W.defensePower(E.advance(s, t)));
  }
  // At the step itself something changed: the copy must not be used any more.
  expect(W.defenseAt(d, d.until!)).not.toBe(W.defensePower(E.advance(s, d.until!)));
});

test("a copy taken after each step stays exact up to the next, all the way to an idle tribe", () => {
  let s = busy();
  let t = T0;

  for (let step = 0; step < 200; step++) {
    const d = W.defenseSnapshot(s);

    if (d.until == null) {
      // Nothing left under way: good forever (population keeps growing).
      for (const later of [t + HOUR, t + 48 * HOUR]) expect(W.defenseAt(d, later)).toBe(W.defensePower(E.advance(s, later)));

      return;
    }
    const mid = Math.floor((t + d.until) / 2);

    expect(W.defenseAt(d, mid)).toBe(W.defensePower(E.advance(s, mid)));
    t = d.until;
    s = E.advance(s, t);
  }
  throw new Error("never went idle");
});

test("scoutFromDefense matches scoutEstimate", () => {
  const s = busy();
  const me = E.createInitialState(T0);

  expect(W.scoutFromDefense(W.defensePower(s), me)).toEqual(W.scoutEstimate(s, me));
  me.buildings["exploration-center"] = 1;
  expect(W.scoutFromDefense(W.defensePower(s), me)).toEqual(W.scoutEstimate(s, me));
});
