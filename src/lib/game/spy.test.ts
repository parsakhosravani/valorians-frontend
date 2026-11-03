import { describe, expect, test } from "bun:test";

import { SPY } from "./config";
import { canSeeSpies, spyCatchChance } from "./spy";

describe("spyCatchChance", () => {
  test("no Watchtower never catches", () => {
    expect(spyCatchChance(0, 0)).toBe(0);
    expect(spyCatchChance(0, 10, "sweep")).toBe(0);
  });

  test("evenly matched buildings give the base chance", () => {
    expect(spyCatchChance(1, 1)).toBeCloseTo(SPY.catchBase);
    expect(spyCatchChance(7, 7)).toBeCloseTo(SPY.catchBase);
  });

  test("each level of difference moves the odds", () => {
    expect(spyCatchChance(5, 1)).toBeCloseTo(SPY.catchBase + 4 * SPY.catchPerLevel);
    expect(spyCatchChance(1, 3)).toBeCloseTo(SPY.catchBase - 2 * SPY.catchPerLevel);
  });

  test("stays within the floor and the ceiling", () => {
    expect(spyCatchChance(1, 30)).toBe(SPY.catchMin);
    expect(spyCatchChance(40, 1)).toBe(SPY.catchMax);
  });

  test("a report roll is gentler; a sweep is a full roll", () => {
    expect(spyCatchChance(5, 1, "report")).toBeCloseTo(spyCatchChance(5, 1) * SPY.reportFactor);
    expect(spyCatchChance(5, 1, "sweep")).toBe(spyCatchChance(5, 1));
  });

  test("a better Exploration Center always helps the spy", () => {
    for (let ec = 1; ec < 20; ec++) expect(spyCatchChance(8, ec + 1)).toBeLessThanOrEqual(spyCatchChance(8, ec));
  });
});

test("canSeeSpies needs a tall enough Watchtower", () => {
  expect(canSeeSpies(SPY.seeLevel - 1)).toBe(false);
  expect(canSeeSpies(SPY.seeLevel)).toBe(true);
});
