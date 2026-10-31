import { expect, test } from "bun:test";

import { ISLAND_RADIUS, islandTerrain } from "./island";
import type { Terrain } from "./map";

const HOME = { x: 40, y: 40 };
const sea = (): Terrain => "sea";
const plains = (): Terrain => "plains";

test("a tribe on land keeps its land as it is", () => {
  expect(islandTerrain(HOME, plains)).toBe(plains);
  expect(islandTerrain(null, sea)).toBe(sea);
});

test("a tribe at sea gets an island of its own, and the sea beyond it stays sea", () => {
  const ground = islandTerrain(HOME, sea);

  expect(ground(HOME.x, HOME.y)).toBe("plains");
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, -1], [2, 0], [0, -2], [2, 1], [-1, 2]]) {
    expect(ground(HOME.x + dx, HOME.y + dy)).not.toBe("sea");
  }
  expect(ground(HOME.x + Math.ceil(ISLAND_RADIUS) + 1, HOME.y)).toBe("sea");
  expect(ground(HOME.x + 3, HOME.y + 3)).toBe("sea");
});

test("only the water is raised: lakes, hills and mountains nearby stay what they are", () => {
  const mixed = (x: number): Terrain => (x === HOME.x + 1 ? "mountains" : "sea");
  const ground = islandTerrain(HOME, mixed);

  expect(ground(HOME.x + 1, HOME.y)).toBe("mountains");
  expect(ground(HOME.x - 1, HOME.y)).not.toBe("sea");
});

test("a cleared claim has no water or mountains inside the border, and leaves the land past it alone", () => {
  const lake = (): Terrain => "lake";
  const t = islandTerrain(HOME, lake, { w: 1.35, h: 1.75, cleared: true });

  expect(t(HOME.x, HOME.y)).toBe("plains");
  expect(t(HOME.x + 2, HOME.y + 3)).toBe("plains");
  expect(t(HOME.x + 7, HOME.y)).toBe("lake");
  expect(islandTerrain(HOME, () => "mountains", { w: 1, h: 1, cleared: true })(HOME.x + 1, HOME.y)).toBe("hills");
  expect(islandTerrain(HOME, lake, { w: 1, h: 1 })(HOME.x, HOME.y)).toBe("lake");
});
