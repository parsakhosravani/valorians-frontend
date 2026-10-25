import { test, expect } from "bun:test";

import * as E from "./engine";
import { buildingGroup, recommendUpgrade, upgradeOptions } from "./advice";
import { BUILDING_BY_ID } from "./config";

const T0 = Date.UTC(2026, 9, 25, 10);

test("groups buildings", () => {
  expect(buildingGroup(BUILDING_BY_ID["iron-mine"])).toBe("economy");
  expect(buildingGroup(BUILDING_BY_ID["barracks"])).toBe("military");
  expect(buildingGroup(BUILDING_BY_ID["city-gate"])).toBe("defense");
});

test("options report what is missing and when it will be affordable", () => {
  const s = E.createInitialState(T0);

  s.resources.clay = 100;
  const mine = upgradeOptions(s).find((o) => o.building.id === "iron-mine")!;

  expect(mine.affordable).toBe(false);
  expect(mine.missing.clay).toBe(50);
  expect(mine.missing.iron).toBeUndefined();
});

test("recommends nothing when every builder is busy", () => {
  let s = E.createInitialState(T0);

  s = E.upgradeBuilding(s, "iron-mine", T0);
  expect(recommendUpgrade(s)).toBeNull();
});

test("recommends the warehouse when storage is nearly full", () => {
  const s = E.createInitialState(T0);
  const cap = E.getRates(s).capacity;

  s.resources.iron = cap;
  expect(recommendUpgrade(s)?.id).toBe("resource-warehouse");
});

test("otherwise recommends a producer", () => {
  const s = E.createInitialState(T0);
  const advice = recommendUpgrade(s)!;

  expect(BUILDING_BY_ID[advice.id].effect.kind).toBe("production");
});
