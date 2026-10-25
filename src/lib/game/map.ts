/**
 * The world map: where tribes and barbarian camps sit, what the land is
 * like, and how long armies take to march. Pure and shared by client and
 * server, so both agree on terrain and travel times.
 */
import { MAP_SIZE, MIN_MARCH_SECONDS, TRIBE_SPACING, UNITS, UNIT_IDS, SCOUT_COST_PER_TILE, SCOUT_MIN_COST } from "./config";
import type { Army } from "./engine";

export type Point = { x: number; y: number };

export type Terrain = "plains" | "forest" | "hills" | "lake";

export const TERRAIN: Record<Terrain, { name: string; defense: number; note: string }> = {
  plains: { name: "Plains", defense: 0, note: "Open ground, no bonus." },
  forest: { name: "Forest", defense: 0.1, note: "+10% defense. Cavalry fights 25% weaker here." },
  hills: { name: "Hills", defense: 0.2, note: "+20% defense." },
  lake: { name: "Lake", defense: 0, note: "Water. Nobody settles here." },
};

const hash = (a: number, b: number, seed = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;

  return s - Math.floor(s);
};

/** Smooth-ish value noise so terrain comes in patches, not salt and pepper. */
const noise = (x: number, y: number, seed: number) => {
  const cell = 6;
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = (x % cell) / cell;
  const fy = (y % cell) / cell;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * (t * t * (3 - 2 * t));
  const top = lerp(hash(gx, gy, seed), hash(gx + 1, gy, seed), fx);
  const bottom = lerp(hash(gx, gy + 1, seed), hash(gx + 1, gy + 1, seed), fx);

  return lerp(top, bottom, fy);
};

export function terrainAt(x: number, y: number): Terrain {
  const water = noise(x, y, 3);
  const n = noise(x, y, 7) * 0.7 + hash(x, y, 9) * 0.3;

  if (water > 0.82) return "lake";
  if (n > 0.62) return "hills";
  if (n < 0.36) return "forest";

  return "plains";
}

export const inMap = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < MAP_SIZE && p.y < MAP_SIZE;

/** The i-th spot on a square spiral out from the middle of the map. */
function spiral(i: number): Point {
  if (i === 0) return { x: 0, y: 0 };
  const ring = Math.ceil((Math.sqrt(i + 1) - 1) / 2);
  const side = ring * 2;
  const start = (side - 1) * (side - 1);
  const k = i - start;
  const leg = Math.floor(k / side);
  const off = (k % side) - ring + 1;

  if (leg === 0) return { x: ring, y: off };
  if (leg === 1) return { x: -off, y: ring };
  if (leg === 2) return { x: -ring, y: -off };

  return { x: off, y: -ring };
}

/** Where the n-th tribe to join settles: spread out on a spiral, never on a lake. */
export function homeSlot(n: number): Point {
  const mid = Math.floor(MAP_SIZE / 2);

  for (let i = n; i < n + 50; i++) {
    const s = spiral(i);
    const p = {
      x: mid + s.x * TRIBE_SPACING + Math.floor(hash(i, 1) * 2),
      y: mid + s.y * TRIBE_SPACING + Math.floor(hash(i, 2) * 2),
    };

    if (inMap(p) && terrainAt(p.x, p.y) !== "lake") return p;
  }

  return { x: mid, y: mid };
}

/** Each player's own barbarian camps, scattered further out the higher the level. */
export function campPosition(playerId: number, level: number, home: Point): Point {
  const angle = hash(playerId, level, 5) * Math.PI * 2;
  const dist = 2 + level * 0.9;

  for (let t = 0; t < 12; t++) {
    const a = angle + t * 0.5;
    const p = {
      x: Math.round(home.x + Math.cos(a) * dist),
      y: Math.round(home.y + Math.sin(a) * dist),
    };

    if (inMap(p) && terrainAt(p.x, p.y) !== "lake" && !(p.x === home.x && p.y === home.y)) return p;
  }

  return { x: Math.min(MAP_SIZE - 1, home.x + 1), y: home.y };
}

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Seconds per tile of the slowest unit sent. */
export function armySpeed(units: Army) {
  return UNITS.reduce((slow, u) => ((units[u.id] ?? 0) > 0 ? Math.max(slow, u.speed) : slow), 0);
}

/** One-way march time in ms. `marchMultiplier` comes from the War Hall. */
export function marchMs(units: Army, dist: number, marchMultiplier = 1) {
  const speed = armySpeed(units) || UNITS[0].speed;

  return Math.round(Math.max(MIN_MARCH_SECONDS, dist * speed * marchMultiplier) * 1000);
}

export const scoutCost = (dist: number) => Math.max(SCOUT_MIN_COST, Math.round(dist * SCOUT_COST_PER_TILE));

export const anyUnits = (units: Army) => UNIT_IDS.some((u) => (units[u] ?? 0) > 0);
