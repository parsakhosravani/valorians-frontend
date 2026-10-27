import { expect, test } from "bun:test";

import * as E from "./engine";
import { MAP_CENTER, MAP_MAX, MAP_MIN, MAP_SIZE } from "./config";
import { Point, TERRAIN, campPositions, homeSlot, marchRoute, pointAlong, routeMs, routeTimeline, terrainAt } from "./map";

const army = (a: Partial<E.Army>) => ({ ...E.emptyArmy(), ...a });
const blocked = (p: Point) => TERRAIN[terrainAt(p.x, p.y)].march == null && terrainAt(p.x, p.y) !== "sea";

/** Two walkable tiles with mountains on the straight line between them. */
function acrossMountains(): { a: Point; b: Point } {
  for (let y = 30; y < 90; y++) {
    for (let x = 30; x < 90; x++) {
      if (terrainAt(x, y) !== "mountains" || terrainAt(x - 3, y) !== "plains" || terrainAt(x + 3, y) !== "plains") continue;
      const a = { x: x - 3, y };
      const b = { x: x + 3, y };
      const r = marchRoute(a, b);
      if (!r.naval && !r.climbed) return { a, b };
    }
  }
  throw new Error("no mountains to march around near the middle of the map");
}

test("there are mountains on the map, but not too many", () => {
  let m = 0;
  for (let y = MAP_MIN; y < MAP_MAX; y++) for (let x = MAP_MIN; x < MAP_MAX; x++) if (terrainAt(x, y) === "mountains") m++;
  const share = m / (MAP_SIZE * MAP_SIZE);
  expect(share).toBeGreaterThan(0.03);
  expect(share).toBeLessThan(0.15);
});

test("armies march around mountains, never over them", () => {
  const { a, b } = acrossMountains();
  const r = marchRoute(a, b);
  expect(r.path[0]).toEqual(a);
  expect(r.path[r.path.length - 1]).toEqual(b);
  for (const p of r.path.slice(1, -1)) expect(blocked(p)).toBe(false);
  expect(r.length).toBeGreaterThan(r.distance);
  expect(r.detour).toBe(true);
  // Each step goes to a neighbouring tile, and never squeezes diagonally between two blocked tiles.
  for (let k = 1; k < r.path.length; k++) {
    const [p, q] = [r.path[k - 1], r.path[k]];
    expect(Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y))).toBe(1);
    if (p.x !== q.x && p.y !== q.y) {
      expect(blocked({ x: q.x, y: p.y }) || blocked({ x: p.x, y: q.y })).toBe(false);
    }
  }
  // The longer road takes longer.
  const units = army({ swordsman: 10 });
  expect(routeMs(units, a, b)).toBeGreaterThan(r.distance * 30 * 1000);
});

test("the road home is the road out, reversed", () => {
  const { a, b } = acrossMountains();
  const out = marchRoute(a, b);
  const back = marchRoute(b, a);
  expect(back.path).toEqual([...out.path].reverse());
  expect(routeMs(army({ axeman: 5 }), a, b)).toBe(routeMs(army({ axeman: 5 }), b, a));
});

test("an army moves along its road over time", () => {
  const { a, b } = acrossMountains();
  const r = marchRoute(a, b);
  const stops = routeTimeline(r, army({ swordsman: 1 }));
  expect(stops[0]).toBe(0);
  expect(stops[stops.length - 1]).toBe(1);
  for (let k = 1; k < stops.length; k++) expect(stops[k]).toBeGreaterThanOrEqual(stops[k - 1]);
  expect(pointAlong(r, stops, 0)).toMatchObject(a);
  expect(pointAlong(r, stops, 1)).toMatchObject(b);
  // Halfway in time is somewhere on the road, not on the straight line through the mountains.
  const mid = pointAlong(r, stops, 0.5);
  const k = r.path.findIndex((p, i) => i > 0 && Math.hypot(p.x - mid.x, p.y - mid.y) <= Math.SQRT2);
  expect(k).toBeGreaterThan(0);
});

test("tribes never settle on mountains or in walled-off valleys; camps always have a road", () => {
  for (let n = 0; n < 300; n++) {
    const p = homeSlot(n);
    expect(terrainAt(p.x, p.y)).not.toBe("mountains");
    expect(marchRoute({ x: MAP_CENTER, y: MAP_CENTER }, p).climbed).toBe(false);
  }
  for (let id = 1; id <= 30; id++) {
    const home = homeSlot(id);
    for (const c of campPositions(id, home, 8)) {
      expect(terrainAt(c.x, c.y)).not.toBe("mountains");
      expect(marchRoute(home, c).climbed).toBe(false);
    }
  }
});

test("a road from between two tiles (a recalled army's turn-back spot) still resolves", () => {
  const r = marchRoute({ x: 10.37, y: 12.81 }, { x: 20, y: 25 });

  expect(r.path.length).toBeGreaterThan(1);
  expect(r.path[0]).toEqual({ x: 10, y: 13 });
});
