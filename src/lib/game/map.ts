/**
 * The world map: where tribes and barbarian camps sit, what the land is
 * like, and how long armies take to march. Pure and shared by client and
 * server, so both agree on terrain and travel times.
 */
import {
  MAP_SIZE,
  MIN_MARCH_SECONDS,
  TRIBE_SPACING,
  UNITS,
  UNIT_BY_ID,
  UNIT_IDS,
  SCOUT_COST_PER_TILE,
  SCOUT_MIN_COST,
  unitSlots,
} from "./config";
import type { Army } from "./engine";

export type Point = { x: number; y: number };

export type Terrain = "plains" | "forest" | "hills" | "lake" | "sea";

export const TERRAIN: Record<Terrain, { name: string; defense: number; note: string }> = {
  plains: { name: "Plains", defense: 0, note: "Open ground, no bonus." },
  forest: { name: "Forest", defense: 0.1, note: "+10% defense. Cavalry fights 25% weaker here." },
  hills: { name: "Hills", defense: 0.2, note: "+20% defense." },
  lake: { name: "Lake", defense: 0, note: "Water. Nobody settles here." },
  sea: { name: "Sea", defense: 0, note: "Open water. Armies need Longships to cross it." },
};

const hash = (a: number, b: number, seed = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;

  return s - Math.floor(s);
};

/** Smooth-ish value noise so terrain comes in patches, not salt and pepper. */
const noise = (x: number, y: number, seed: number, cell = 6) => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = (x % cell) / cell;
  const fy = (y % cell) / cell;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * (t * t * (3 - 2 * t));
  const top = lerp(hash(gx, gy, seed), hash(gx + 1, gy, seed), fx);
  const bottom = lerp(hash(gx, gy + 1, seed), hash(gx + 1, gy + 1, seed), fx);

  return lerp(top, bottom, fy);
};

/** Seas: big, slow noise for the coastline's shape, a little fine noise to make it ragged. */
export const seaAt = (x: number, y: number) => noise(x, y, 13, 14) * 0.75 + noise(x, y, 14, 4) * 0.25 > 0.62;

export function terrainAt(x: number, y: number): Terrain {
  if (seaAt(x, y)) return "sea";
  const water = noise(x, y, 3);
  const n = noise(x, y, 7) * 0.7 + hash(x, y, 9) * 0.3;

  if (water > 0.82) return "lake";
  if (n > 0.62) return "hills";
  if (n < 0.36) return "forest";

  return "plains";
}

export const inMap = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < MAP_SIZE && p.y < MAP_SIZE;

/** Land nobody can settle or camp on. */
const isWater = (t: Terrain) => t === "lake" || t === "sea";

/**
 * On the sea's edge: next to a sea tile (or, for the few tribes that settled
 * before the seas were charted, on an island in it). Coastal tribes can be
 * attacked from the sea, where they fight with the beach on their side.
 */
export function isCoastal(p: Point) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (seaAt(p.x + dx, p.y + dy)) return true;

  return false;
}

/**
 * How a march from `a` to `b` goes: tiles of land walked and tiles of sea
 * sailed along the straight line. The start and end tiles always count as
 * land (armies leave from and land on a beach). Any sea at all means ships.
 */
export function seaRoute(a: Point, b: Point) {
  const d = distance(a, b);
  const steps = Math.max(1, Math.ceil(d * 4));
  let wet = 0;

  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const x = Math.round(a.x + (b.x - a.x) * t);
    const y = Math.round(a.y + (b.y - a.y) * t);

    if ((x === a.x && y === a.y) || (x === b.x && y === b.y)) continue;
    if (seaAt(x, y)) wet++;
  }
  const sea = (d * wet) / steps;

  return { naval: wet > 0, sea, land: d - sea, distance: d };
}

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

    if (inMap(p) && !isWater(terrainAt(p.x, p.y))) return p;
  }

  return { x: mid, y: mid };
}

const key = (p: Point) => `${p.x},${p.y}`;

/**
 * Where a player's level-`level` barbarian camp sits, scattered further out
 * the higher the level. Camps prefer land you can walk to; only when there
 * is none around (an island) do they sit across the water. A camp never sits
 * on the player's own tribe or on any tile in `taken` (other tribes, lower
 * camps), so it can't hide under a village on the map.
 */
export function campPosition(playerId: number, level: number, home: Point, taken: ReadonlySet<string> = new Set()): Point {
  const angle = hash(playerId, level, 5) * Math.PI * 2;
  const base = 2 + level * 0.9;
  const free = (p: Point) =>
    inMap(p) && !isWater(terrainAt(p.x, p.y)) && !(p.x === home.x && p.y === home.y) && !taken.has(key(p));
  let overSea: Point | null = null;

  // Ring by ring outwards: the ideal distance first, then a little further if crowded.
  for (let ring = 0; ring < 4; ring++) {
    const dist = base + ring;

    for (let t = 0; t < 13; t++) {
      const a = angle + t * 0.5;
      const p = {
        x: Math.round(home.x + Math.cos(a) * dist),
        y: Math.round(home.y + Math.sin(a) * dist),
      };

      if (!free(p)) continue;
      if (!seaRoute(home, p).naval) return p;
      overSea ??= p;
    }
    if (overSea) return overSea;
  }

  // Last resort: the nearest free tile around home.
  for (let r = 1; r < MAP_SIZE; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const p = { x: home.x + dx, y: home.y + dy };

        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && free(p)) return p;
      }

  return { x: Math.min(MAP_SIZE - 1, home.x + 1), y: home.y };
}

/**
 * All of a player's camps from level 1 to `upTo`, each kept off tribes'
 * tiles and off the lower camps, so no two things share a tile.
 */
export function campPositions(playerId: number, home: Point, upTo: number, tribes: Point[] = []): Point[] {
  const taken = new Set(tribes.map(key));
  const out: Point[] = [];

  for (let level = 1; level <= upTo; level++) {
    const p = campPosition(playerId, level, home, taken);

    taken.add(key(p));
    out.push(p);
  }

  return out;
}

/** How far out the furthest camp can land, for loading the tribes around it. */
export const CAMP_REACH = (maxLevel: number) => Math.ceil(2 + maxLevel * 0.9 + 4);

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Seconds per tile of the slowest unit sent, on land (ships don't walk). */
export function armySpeed(units: Army) {
  return UNITS.reduce((slow, u) => (!u.transport && (units[u.id] ?? 0) > 0 ? Math.max(slow, u.speed) : slow), 0);
}

// ─── Ships ───────────────────────────────────────────────────────────────────

const SHIP = UNITS.find((u) => u.transport)!;

/** Room the troops take on ships (ships themselves take none). */
export const troopSlots = (units: Army) => UNITS.reduce((n, u) => n + unitSlots(u) * (units[u.id] ?? 0), 0);

/** Longships it takes to carry this army across the sea. */
export const shipsNeeded = (units: Army) => Math.ceil(troopSlots(units) / SHIP.transport!);

/** Seconds per tile at sea. */
export const SAIL_SECONDS_PER_TILE = UNIT_BY_ID[SHIP.id].speed;

/**
 * One-way time in ms from `from` to `to`: the land part at the army's
 * walking pace, the sea part at sailing speed.
 */
export function routeMs(units: Army, from: Point, to: Point, marchMultiplier = 1) {
  const r = seaRoute(from, to);
  const walk = armySpeed(units) || UNITS[0].speed;
  const seconds = r.land * walk + r.sea * SAIL_SECONDS_PER_TILE;

  return Math.round(Math.max(MIN_MARCH_SECONDS, seconds * marchMultiplier) * 1000);
}

/** One-way march time in ms. `marchMultiplier` comes from the War Hall. */
export function marchMs(units: Army, dist: number, marchMultiplier = 1) {
  const speed = armySpeed(units) || UNITS[0].speed;

  return Math.round(Math.max(MIN_MARCH_SECONDS, dist * speed * marchMultiplier) * 1000);
}

export const scoutCost = (dist: number) => Math.max(SCOUT_MIN_COST, Math.round(dist * SCOUT_COST_PER_TILE));

export const anyUnits = (units: Army) => UNIT_IDS.some((u) => (units[u] ?? 0) > 0);

/** Name of the ship unit, for messages. */
export const SHIP_ID = SHIP.id;
