import { expect, test } from "bun:test";

import { roadShape, timeAt } from "./roadShape";

const T = 46;
/** A road of tiles in px: east 12 tiles, then a diagonal staircase down 6. */
const tiles = [
  ...Array.from({ length: 12 }, (_, i) => ({ x: i * T, y: 0 })),
  ...Array.from({ length: 6 }, (_, i) => ({ x: (12 + i) * T, y: (i + 1) * T })),
];

test("starts and ends on the villages, with u running 0..tiles-1 in order", () => {
  const r = roadShape(tiles, T);

  expect(r.points[0]).toEqual(tiles[0]);
  expect(r.points[r.points.length - 1]).toEqual(tiles[tiles.length - 1]);
  expect(r.u[0]).toBe(0);
  expect(r.u[r.u.length - 1]).toBe(tiles.length - 1);
  for (let i = 1; i < r.u.length; i++) expect(r.u[i]).toBeGreaterThanOrEqual(r.u[i - 1]);
});

/** How far a point is from the tile path (its segments). */
const offRoad = (p: { x: number; y: number }, path = tiles) => {
  let near = Infinity;

  for (let k = 0; k < path.length - 1; k++) {
    const a = path[k];
    const b = path[k + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));

    near = Math.min(near, Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y));
  }

  return near;
};

test("meanders on open ground, but stays within about a tile of its tiles", () => {
  const r = roadShape(tiles, T);
  const most = Math.max(...r.points.map((p) => offRoad(p)));

  expect(most).toBeGreaterThan(T * 0.4);
  expect(most).toBeLessThan(T * 1.3);
});

test("never crosses ground it can't: pulls back to its tiles there", () => {
  // A wall of mountains hugging the road's north side, and a lake to its south, over most of the way.
  const blocked = (p: { x: number; y: number }) => p.x > T * 2 && p.x < T * 10 && Math.abs(p.y) > T * 0.45;
  const r = roadShape(tiles, T, (p) => !blocked(p));

  for (const p of r.points) expect(blocked(p)).toBe(false);
  // Out in the open again it still meanders.
  const free = roadShape(tiles, T);

  expect(r.points.length).toBe(free.points.length);
});

test("a long straight road no longer looks ruled", () => {
  const line = Array.from({ length: 30 }, (_, i) => ({ x: i * T, y: 0 }));
  const r = roadShape(line, T);

  expect(Math.max(...r.points.map((p) => Math.abs(p.y)))).toBeGreaterThan(T * 0.5);
});

test("the road home is the road out, reversed", () => {
  const out = roadShape(tiles, T);
  const home = roadShape(tiles.slice().reverse(), T);

  expect(home.points).toEqual(out.points.slice().reverse());
  expect(home.u).toEqual(out.u.map((u) => tiles.length - 1 - u).reverse());
});

test("one tile, or two next to each other, stay as they are at the ends", () => {
  expect(roadShape([{ x: 5, y: 5 }], T)).toEqual({ points: [{ x: 5, y: 5 }], u: [0] });
  const two = roadShape([{ x: 0, y: 0 }, { x: T, y: 0 }], T);

  expect(two.points[0]).toEqual({ x: 0, y: 0 });
  expect(two.points[two.points.length - 1]).toEqual({ x: T, y: 0 });
});

test("timeAt follows the tiles' times", () => {
  expect(timeAt([0, 0.2, 1], 0)).toBe(0);
  expect(timeAt([0, 0.2, 1], 0.5)).toBeCloseTo(0.1);
  expect(timeAt([0, 0.2, 1], 1.5)).toBeCloseTo(0.6);
  expect(timeAt([0, 0.2, 1], 2)).toBe(1);
  expect(timeAt([0], 0)).toBe(0);
});
