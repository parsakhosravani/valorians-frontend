import { expect, test } from "bun:test";

import { placeBuildings, villageLayout, waterSide } from "./villageLayout";

import type { Terrain } from "@/lib/game/map";

const IDS = [
  "town-hall", "city-gate", "watchtower", "harbor", "iron-mine", "sawmill", "brickyard", "windmill", "fertilizer-workshop",
  "hideout", "treasury", "academy", "embassy", "trading-post", "resource-warehouse", "exploration-center", "war-hall",
  "hospital", "military-command", "barracks", "stable", "siege-workshop", "arsenal", "armory", "trapmaker",
];

test("every building gets its own room, roomy enough for its name, on a phone and on a wide window", () => {
  for (const width of [320, 343, 390, 700, 1000]) {
    const layout = villageLayout(width, IDS.length, Math.min(640, width * 0.6));
    const plots = placeBuildings(layout, IDS);
    const used = Object.values(plots);

    expect(Object.keys(plots).sort()).toEqual([...IDS].sort());
    expect(new Set(used.map((s) => `${s.x},${s.y}`)).size).toBe(IDS.length);
    expect(layout.cellW).toBeGreaterThanOrEqual(80);
    expect(layout.cellH).toBeGreaterThanOrEqual(84);
    // Inside the frame.
    for (const s of used) {
      expect(s.x - layout.cellW / 2).toBeGreaterThanOrEqual(-0.01);
      expect(s.x + layout.cellW / 2).toBeLessThanOrEqual(width + 0.01);
      expect(s.y + layout.cellH / 2).toBeLessThanOrEqual(layout.height);
    }
  }
});

test("on a phone: four across, the Town Hall in the very middle", () => {
  const layout = villageLayout(343, IDS.length, 206);
  const plots = placeBuildings(layout, IDS);

  expect(layout.cols).toBe(4);
  expect(plots["town-hall"].x).toBeCloseTo(343 / 2);
  expect(Math.abs(plots["town-hall"].y - layout.height / 2)).toBeLessThan(layout.cellH / 2);
});

test("the gate at the front, offices round the hall, workshops at the back", () => {
  const layout = villageLayout(343, IDS.length, 206);
  const plots = placeBuildings(layout, IDS);
  const hall = plots["town-hall"];
  const d = (id: string) => Math.hypot((plots[id].x - hall.x) / layout.cellW, (plots[id].y - hall.y) / layout.cellH);

  expect(plots["city-gate"].row).toBe(layout.rows - 1);
  expect(d("resource-warehouse")).toBeLessThan(d("iron-mine"));
  expect(plots["iron-mine"].y).toBeLessThan(hall.y);
});

test("the harbor faces the water; a tribe out on the open sea still gets every building", () => {
  const HOME = { x: 50, y: 50 };
  // Sea to the east.
  const east = (x: number): Terrain => (x >= HOME.x + 2 ? "sea" : "plains");
  const w = waterSide(HOME, east)!;

  expect(w.x).toBeGreaterThan(0.9);
  const layout = villageLayout(343, IDS.length, 206);

  expect(placeBuildings(layout, IDS, w).harbor.x).toBeGreaterThan(343 * 0.7);

  // An island tribe: water everywhere.
  const sea = (): Terrain => "sea";

  expect(Object.keys(placeBuildings(layout, IDS, waterSide(HOME, sea))).length).toBe(IDS.length);
  // No water nearby at all.
  expect(waterSide(HOME, () => "plains")).toBeNull();
});

test("the same frame always gives the same village", () => {
  const layout = villageLayout(390, IDS.length, 234);

  expect(placeBuildings(layout, IDS)).toEqual(placeBuildings(layout, [...IDS].reverse()));
});
