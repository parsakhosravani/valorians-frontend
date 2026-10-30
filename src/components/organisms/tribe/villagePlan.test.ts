import { expect, test } from "bun:test";

import { claimOutline, villagePlan } from "./villagePlan";

import type { Terrain } from "@/lib/game/map";

const IDS = [
  "town-hall", "city-gate", "watchtower", "harbor", "iron-mine", "sawmill", "brickyard", "windmill", "fertilizer-workshop",
  "hideout", "treasury", "academy", "embassy", "trading-post", "resource-warehouse", "exploration-center", "war-hall",
  "hospital", "military-command", "barracks", "stable", "siege-workshop", "arsenal", "armory", "trapmaker",
];
const HOME = { x: 40, y: 40 };
const plains = (): Terrain => "plains";
/** Sea to the west (two tiles out), hills to the east, a wood to the north. */
const coast = (x: number, y: number): Terrain => (x <= HOME.x - 2 ? "sea" : x >= HOME.x + 2 ? "hills" : y <= HOME.y - 2 ? "forest" : "plains");

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const border = claimOutline();
/** How far the border is in the direction of p (tiles). */
const edgeTowards = (p: { x: number; y: number }) => {
  const th = Math.atan2(p.y, p.x);
  let best = border[0];

  for (const b of border) if (Math.abs(Math.atan2(b.y, b.x) - th) < Math.abs(Math.atan2(best.y, best.x) - th)) best = b;

  return Math.hypot(best.x, best.y);
};

test("every building gets a plot, the Town Hall on your tile, none on top of another", () => {
  const { plots } = villagePlan(HOME, IDS, plains);

  expect(Object.keys(plots).sort()).toEqual([...IDS].sort());
  expect(plots["town-hall"]).toEqual({ x: 0, y: 0 });
  const all = Object.values(plots);

  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(dist(all[i], all[j])).toBeGreaterThanOrEqual(0.6);
});

test("the town stays inside your border; only workshops, the gate, tower and harbor may sit on or past it", () => {
  const { plots } = villagePlan(HOME, IDS, plains);
  const outside = ["city-gate", "watchtower", "harbor", "iron-mine", "sawmill", "brickyard", "windmill", "fertilizer-workshop"];

  for (const [id, p] of Object.entries(plots)) {
    expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(edgeTowards(p) + (outside.includes(id) ? 1.05 : 0.05));
  }
});

test("buildings follow the land: never on water, harbor on the shore, mine in the hills, sawmill by the woods", () => {
  const { plots } = villagePlan(HOME, IDS, coast);
  const at = (id: string) => coast(Math.round(HOME.x + plots[id].x), Math.round(HOME.y + plots[id].y));

  for (const id of IDS) expect(at(id)).not.toBe("sea");
  // The harbor stands on land with the sea right next to it.
  expect(HOME.x + plots.harbor.x).toBeLessThan(HOME.x - 0.4);
  expect(at("iron-mine")).toBe("hills");
  expect(["forest"].includes(at("sawmill")) || HOME.y + plots.sawmill.y < HOME.y - 0.8).toBe(true);
});

test("keeps off a neighbour's village", () => {
  const neighbour = { x: HOME.x + 3, y: HOME.y };
  const { plots } = villagePlan(HOME, IDS, plains, [neighbour]);

  for (const p of Object.values(plots)) expect(Math.hypot(HOME.x + p.x - neighbour.x, HOME.y + p.y - neighbour.y)).toBeGreaterThanOrEqual(1.15);
});

test("the same land always gives the same village, with one track to each building", () => {
  const a = villagePlan(HOME, IDS, coast);
  const b = villagePlan(HOME, [...IDS].reverse(), coast);

  expect(a.plots).toEqual(b.plots);
  expect(a.tracks.length).toBe(IDS.length - 1);
  expect(new Set(a.tracks.map(([, to]) => to)).size).toBe(IDS.length - 1);
});
