/**
 * The world map: where tribes and barbarian camps sit, what the land is
 * like, and how long armies take to march. Pure and shared by client and
 * server, so both agree on terrain and travel times.
 */
import {
  CAMP_STEEP_UNTIL,
  MAP_CENTER,
  MAP_MAX,
  MAP_MIN,
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

export type Terrain = "plains" | "forest" | "hills" | "mountains" | "lake" | "sea";

/**
 * `march` is how much slower armies walk across a tile (1 = plains pace);
 * `null` means they can't walk it at all and have to go around.
 */
export const TERRAIN: Record<Terrain, { name: string; defense: number; march: number | null; note: string }> = {
  plains: { name: "Plains", defense: 0, march: 1, note: "Open ground, no bonus." },
  forest: { name: "Forest", defense: 0.1, march: 1.2, note: "+10% defense. Cavalry fights 25% weaker here. Slow going." },
  hills: { name: "Hills", defense: 0.2, march: 1.4, note: "+20% defense. Armies climb slowly." },
  mountains: { name: "Mountains", defense: 0.3, march: null, note: "+30% defense. Too tall to cross: armies march around." },
  lake: { name: "Lake", defense: 0, march: null, note: "Water. Nobody settles here, armies walk around." },
  sea: { name: "Sea", defense: 0, march: null, note: "Open water. Armies need Longships to cross it." },
};

/** A steady pseudo-random number in [0, 1) for a pair of numbers and a seed. */
export const hash = (a: number, b: number, seed = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;

  return s - Math.floor(s);
};

/** Smooth-ish value noise so terrain comes in patches, not salt and pepper. */
const noise = (x: number, y: number, seed: number, cell = 6) => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  // x - gx * cell is x % cell for the old, non-negative tiles (same land as
  // always) and stays 0..cell for negative ones, where % would go negative.
  const fx = (x - gx * cell) / cell;
  const fy = (y - gy * cell) / cell;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * (t * t * (3 - 2 * t));
  const top = lerp(hash(gx, gy, seed), hash(gx + 1, gy, seed), fx);
  const bottom = lerp(hash(gx, gy + 1, seed), hash(gx + 1, gy + 1, seed), fx);

  return lerp(top, bottom, fy);
};

/** Seas: big, slow noise for the coastline's shape, a little fine noise to make it ragged. */
export const seaAt = (x: number, y: number) => noise(x, y, 13, 14) * 0.75 + noise(x, y, 14, 4) * 0.25 > 0.62;

/**
 * Mountains: solid massifs where the hill country is highest, plus long thin
 * ridges that wall valleys off, broken here and there by a pass.
 */
const peakAt = (x: number, y: number) => noise(x, y, 7) * 0.85 + noise(x, y, 9, 2) * 0.15 > 0.78;
const ridgeAt = (x: number, y: number) => 1 - Math.abs(2 * noise(x, y, 31, 11) - 1) > 0.94 && noise(x, y, 33, 4) > 0.35;

export function terrainAt(x: number, y: number): Terrain {
  if (seaAt(x, y)) return "sea";
  const water = noise(x, y, 3);
  const n = noise(x, y, 7) * 0.7 + hash(x, y, 9) * 0.3;

  if (water > 0.82) return "lake";
  if (peakAt(x, y) || ridgeAt(x, y)) return "mountains";
  if (n > 0.62) return "hills";
  if (n < 0.36) return "forest";

  return "plains";
}

export const inMap = (p: Point) => p.x >= MAP_MIN && p.y >= MAP_MIN && p.x < MAP_MAX && p.y < MAP_MAX;

/** Ground nobody can settle or camp on. */
const isWater = (t: Terrain) => t === "lake" || t === "sea";
const unsettled = (t: Terrain) => isWater(t) || t === "mountains";

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
 * How a march from `a` to `b` goes: tiles of land walked (weighted by how
 * rough the ground is) and tiles of sea sailed, along the road the army
 * actually takes (see `marchRoute`). Any sea at all means ships.
 */
export function seaRoute(a: Point, b: Point) {
  const r = marchRoute(a, b);

  return { naval: r.naval, sea: r.sea, land: r.land, distance: r.distance };
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

/**
 * Where the n-th tribe to join settles: spread out on a spiral, never on water
 * or a mountain, and never in a valley the mountains wall off.
 */
export function homeSlot(n: number): Point {
  const mid = MAP_CENTER;

  for (let i = n; i < n + 50; i++) {
    const s = spiral(i);
    const p = {
      x: mid + s.x * TRIBE_SPACING + Math.floor(hash(i, 1) * 2),
      y: mid + s.y * TRIBE_SPACING + Math.floor(hash(i, 2) * 2),
    };

    if (inMap(p) && !unsettled(terrainAt(p.x, p.y)) && !marchRoute({ x: mid, y: mid }, p).climbed) return p;
  }

  return { x: mid, y: mid };
}

/** The outermost ring of the settling spiral that still fits in the world. */
export const MAX_RING = Math.floor((MAP_SIZE / 2 - 2) / TRIBE_SPACING);

/**
 * How full the world is once a tribe settles at `p`: the share of the
 * spiral's area out to p's ring (0 at the middle, 1 at the last ring).
 */
export const settledShare = (p: Point) => {
  const ring = Math.round(Math.max(Math.abs(p.x - MAP_CENTER), Math.abs(p.y - MAP_CENTER)) / TRIBE_SPACING);

  return Math.min(1, ((2 * ring + 1) / (2 * MAX_RING + 1)) ** 2);
};

const key = (p: Point) => `${p.x},${p.y}`;

/** How many steps out from home a camp sits: its level, then a band of the last six steep camps' distances. */
const LATE_BAND = 6;
const campRing = (level: number) =>
  level <= CAMP_STEEP_UNTIL ? level : CAMP_STEEP_UNTIL - LATE_BAND + 1 + ((level - CAMP_STEEP_UNTIL - 1) % LATE_BAND);

/**
 * Where a player's level-`level` barbarian camp sits, scattered further out
 * the higher the level up to CAMP_STEEP_UNTIL. Camps past that don't keep
 * marching off (camp 50 would be hours away): they cycle through the band
 * of the last few steep camps' distances, so they're about as far as camp 30. Camps never sit on mountains and always have a road
 * to them. They prefer land you can walk to; only when there
 * is none around (an island) do they sit across the water. A camp never sits
 * on the player's own tribe or on any tile in `taken` (other tribes, lower
 * camps), so it can't hide under a village on the map.
 */
export function campPosition(playerId: number, level: number, home: Point, taken: ReadonlySet<string> = new Set()): Point {
  const angle = hash(playerId, level, 5) * Math.PI * 2;
  const base = 2 + campRing(level) * 0.9;
  const free = (p: Point) =>
    inMap(p) && !unsettled(terrainAt(p.x, p.y)) && !(p.x === home.x && p.y === home.y) && !taken.has(key(p));
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
      const r = marchRoute(home, p);

      // Walled in by mountains: no camp there.
      if (r.climbed) continue;
      if (!r.naval) return p;
      overSea ??= p;
    }
    if (overSea) return overSea;
  }

  // Last resort: the nearest free tile around home.
  for (let r = 1; r < 60; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const p = { x: home.x + dx, y: home.y + dy };

        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && free(p)) return p;
      }

  return { x: Math.min(MAP_MAX - 1, home.x + 1), y: home.y };
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
 * One-way time in ms from `from` to `to` along the army's road: the land part
 * at the army's walking pace (slower over rough ground), the sea part at
 * sailing speed.
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

// ─── Roads: how armies find their way ────────────────────────────────────────
//
// Armies don't march in a straight line any more. They walk around mountains
// and lakes, prefer easy ground over forest and hills, and only take to the
// sea when walking would be a long way round (or there's no way on foot).
// Everything here is pure and deterministic, so client and server always
// agree on the road and its time.

const N = MAP_SIZE;
/** A tile's place in the world grid (row by row from the top-left corner). */
const at = (x: number, y: number) => (y - MAP_MIN) * N + (x - MAP_MIN);
const CODES: Terrain[] = ["plains", "forest", "hills", "mountains", "lake", "sea"];
const SEA = CODES.indexOf("sea");
let GRID: Uint8Array | null = null;
let SURVEYED: Uint8Array | null = null;

/**
 * The world's terrain, worked out tile by tile as roads first need it (the
 * world is too big to survey all at once on a phone).
 */
function terrainCode(i: number) {
  if (!GRID) {
    GRID = new Uint8Array(N * N);
    SURVEYED = new Uint8Array(N * N);
  }
  if (!SURVEYED![i]) {
    GRID[i] = CODES.indexOf(terrainAt((i % N) + MAP_MIN, Math.floor(i / N) + MAP_MIN));
    SURVEYED![i] = 1;
  }

  return GRID[i];
}

/** A walk is fine unless it's this much longer than the straight line; then ships are better. */
const MAX_DETOUR = (straight: number) => straight * 1.75 + 4;
/** Last resort when a spot is walled in: scrambling over peaks or wading, very slowly. */
const CLIMB_COST = 4;

type Mode = { sea: boolean; climb: boolean };

/** Cost to cross one tile, or null if it can't be entered. Start and end tiles are always open. */
function tileCost(i: number, mode: Mode, end: boolean): number | null {
  const t = CODES[terrainCode(i)];

  if (t === "sea") return mode.sea || mode.climb ? 1 : end ? 1 : null;
  const march = TERRAIN[t].march;

  if (march != null) return march;

  return end ? 1 : mode.climb ? CLIMB_COST : null;
}

/**
 * A* over the tile grid, 8 directions, no cutting corners past blocked tiles.
 * It searches the box round `a` and `b` grown by `margin` tiles (clipped to
 * the world), so a short march doesn't look at the whole world. Returns the
 * road as world-grid indexes.
 */
function search(
  a: Point,
  b: Point,
  mode: Mode,
  limit = Infinity,
  margin = Infinity,
): { path: number[]; cost: number } | null {
  const x0 = Math.max(MAP_MIN, Math.min(a.x, b.x) - margin);
  const y0 = Math.max(MAP_MIN, Math.min(a.y, b.y) - margin);
  const x1 = Math.min(MAP_MAX - 1, Math.max(a.x, b.x) + margin);
  const y1 = Math.min(MAP_MAX - 1, Math.max(a.y, b.y) + margin);
  const W = x1 - x0 + 1;
  const H = y1 - y0 + 1;
  // Local index inside the box, and back to the world grid.
  const loc = (x: number, y: number) => (y - y0) * W + (x - x0);
  const world = (i: number) => at((i % W) + x0, Math.floor(i / W) + y0);
  const start = loc(a.x, a.y);
  const goal = loc(b.x, b.y);
  const g = new Float64Array(W * H).fill(Infinity);
  const came = new Int32Array(W * H).fill(-1);
  const done = new Uint8Array(W * H);
  const cost = (i: number) => tileCost(world(i), mode, i === start || i === goal);
  const h = (i: number) => {
    const dx = Math.abs((i % W) + x0 - b.x);
    const dy = Math.abs(Math.floor(i / W) + y0 - b.y);

    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  // Binary heap of [f, i].
  const heap: number[] = [];
  const push = (f: number, i: number) => {
    heap.push(f, i);
    let c = heap.length / 2 - 1;

    while (c > 0) {
      const p = (c - 1) >> 1;

      if (heap[p * 2] <= heap[c * 2]) break;
      [heap[p * 2], heap[c * 2]] = [heap[c * 2], heap[p * 2]];
      [heap[p * 2 + 1], heap[c * 2 + 1]] = [heap[c * 2 + 1], heap[p * 2 + 1]];
      c = p;
    }
  };
  let topF = 0;
  const pop = () => {
    topF = heap[0];
    const top = heap[1];
    const li = heap.pop()!;
    const lf = heap.pop()!;
    const n = heap.length / 2;

    if (n > 0) {
      heap[0] = lf;
      heap[1] = li;
      let c = 0;

      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let m = c;

        if (l < n && heap[l * 2] < heap[m * 2]) m = l;
        if (r < n && heap[r * 2] < heap[m * 2]) m = r;
        if (m === c) break;
        [heap[m * 2], heap[c * 2]] = [heap[c * 2], heap[m * 2]];
        [heap[m * 2 + 1], heap[c * 2 + 1]] = [heap[c * 2 + 1], heap[m * 2 + 1]];
        c = m;
      }
    }

    return top;
  };

  g[start] = 0;
  push(h(start), start);
  while (heap.length) {
    const i = pop();

    if (done[i]) continue;
    // Everything left is longer than we'd walk.
    if (topF > limit) break;
    done[i] = 1;
    if (i === goal) break;
    const x = i % W;
    const y = Math.floor(i / W);
    const here = cost(i)!;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;

        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;

        if (done[j]) continue;
        const there = cost(j);

        if (there == null) continue;
        // Diagonals only when both tiles beside the step are open too.
        if (dx && dy && (cost(y * W + nx) == null || cost(ny * W + x) == null)) continue;
        const step = (dx && dy ? Math.SQRT2 : 1) * (here + there) / 2;
        const ng = g[i] + step;

        if (ng < g[j]) {
          g[j] = ng;
          came[j] = i;
          push(ng + h(j), j);
        }
      }
    }
  }
  if (!done[goal]) return null;
  const path: number[] = [];

  for (let i = goal; i !== -1; i = came[i]) path.push(world(i));

  return { path: path.reverse(), cost: g[goal] };
}

export type MarchRoute = {
  /** Tiles along the road, from start to end. */
  path: Point[];
  /** For each tile on the path: out on the water there. */
  wet: boolean[];
  /** Per step between path tiles: [land tiles walked (weighted by ground), sea tiles sailed]. */
  steps: [number, number][];
  /** Totals over the whole road. */
  land: number;
  sea: number;
  naval: boolean;
  /** Tiles along the road. */
  length: number;
  /** Straight-line distance, as shown on the map. */
  distance: number;
  /** The road bends noticeably around something. */
  detour: boolean;
  /** No proper road exists: the army scrambles over mountains or wades a lake. */
  climbed: boolean;
};

function build(a: Point, b: Point, idx: number[], climbed: boolean): MarchRoute {
  const path = idx.map((i) => ({ x: (i % N) + MAP_MIN, y: Math.floor(i / N) + MAP_MIN }));
  const last = path.length - 1;
  // Start and end are beaches/homes: always land.
  const wet = idx.map((i, k) => k !== 0 && k !== last && terrainCode(i) === SEA);
  const pace = (k: number) => {
    if (k === 0 || k === last) return 1;
    const m = TERRAIN[CODES[terrainCode(idx[k])]].march;

    return m ?? CLIMB_COST;
  };
  const steps: [number, number][] = [];
  let land = 0;
  let sea = 0;
  let length = 0;

  for (let k = 0; k < last; k++) {
    const len = distance(path[k], path[k + 1]);
    let l = 0;
    let s = 0;

    // Half the step is on each tile.
    for (const e of [k, k + 1]) {
      if (wet[e]) s += len / 2;
      else l += (len / 2) * pace(e);
    }
    steps.push([l, s]);
    land += l;
    sea += s;
    length += len;
  }
  const straight = distance(a, b);

  return {
    path,
    wet,
    steps,
    land,
    sea,
    naval: sea > 0,
    length,
    distance: straight,
    detour: length > straight * 1.15 + 0.5,
    climbed,
  };
}

function findRoute(a: Point, b: Point): MarchRoute {
  if (a.x === b.x && a.y === b.y) return build(a, b, [at(a.x, a.y)], false);
  if (!inMap(a) || !inMap(b)) {
    // Off the map (shouldn't happen): the old straight line.
    const d = distance(a, b);

    return { path: [a, b], wet: [false, false], steps: [[d, 0]], land: d, sea: 0, naval: false, length: d, distance: d, detour: false, climbed: false };
  }
  // On foot if there's a sensible way round; the sea search can use every
  // land road too, so if walking is too far it finds the shorter way by ship.
  const straight = distance(a, b);
  const limit = MAX_DETOUR(straight);
  // A walk no longer than `limit` stays inside the ellipse round a and b, so
  // it never strays further than the ellipse's half-width outside their box:
  // searching that box (plus a tile) finds exactly what the whole world would.
  const reach = Math.ceil(Math.sqrt(limit * limit - straight * straight) / 2) + 1;
  const walk = search(a, b, { sea: false, climb: false }, limit, reach);

  if (walk) return build(a, b, walk.path, false);
  // Sea lanes and scrambles have no length limit: look near first, then the whole world.
  const near = Math.max(24, Math.ceil(straight));
  const sail = search(a, b, { sea: true, climb: false }, Infinity, near) ?? search(a, b, { sea: true, climb: false });

  if (sail) return build(a, b, sail.path, false);
  const climb = (search(a, b, { sea: true, climb: true }, Infinity, near) ?? search(a, b, { sea: true, climb: true }))!;

  return build(a, b, climb.path, true);
}

const ROUTES = new Map<string, MarchRoute>();

const reverse = (r: MarchRoute): MarchRoute => ({
  ...r,
  path: [...r.path].reverse(),
  wet: [...r.wet].reverse(),
  steps: [...r.steps].reverse(),
});

/**
 * The road an army takes from `a` to `b`. The same road both ways, so the
 * trip home mirrors the trip out.
 */
export function marchRoute(a0: Point, b0: Point): MarchRoute {
  // Roads run tile to tile: a spot between tiles (where a recalled army turned
  // round) snaps to the nearest one, or the search never reaches it.
  const a = { x: Math.round(a0.x), y: Math.round(a0.y) };
  const b = { x: Math.round(b0.x), y: Math.round(b0.y) };
  const flip = at(a.x, a.y) > at(b.x, b.y);
  const [p, q] = flip ? [b, a] : [a, b];
  const k = `${p.x},${p.y}>${q.x},${q.y}`;
  let r = ROUTES.get(k);

  if (!r) {
    r = findRoute(p, q);
    if (ROUTES.size > 2000) ROUTES.delete(ROUTES.keys().next().value!);
    ROUTES.set(k, r);
  }

  return flip ? reverse(r) : r;
}

/**
 * Where along its road an army is, `f` of the way through its trip in time
 * (0 = just left, 1 = arrived). Walking and sailing go at different speeds,
 * so time and distance don't line up. Returns the spot in tile coordinates
 * and whether it's at sea right there.
 */
export function routeTimeline(r: MarchRoute, units: Army | null) {
  const walk = (units && armySpeed(units)) || UNITS[0].speed;
  const at = [0];

  for (const [l, s] of r.steps) at.push(at[at.length - 1] + l * walk + s * SAIL_SECONDS_PER_TILE);
  const total = at[at.length - 1] || 1;

  return at.map((t) => t / total);
}

export function pointAlong(r: MarchRoute, stops: number[], f: number): { x: number; y: number; atSea: boolean } {
  const p = r.path;

  if (p.length === 1 || f <= 0) return { ...p[0], atSea: false };
  if (f >= 1) return { ...p[p.length - 1], atSea: false };
  let k = 0;

  while (k < stops.length - 2 && stops[k + 1] < f) k++;
  const span = stops[k + 1] - stops[k] || 1;
  const t = (f - stops[k]) / span;

  return {
    x: p[k].x + (p[k + 1].x - p[k].x) * t,
    y: p[k].y + (p[k + 1].y - p[k].y) * t,
    atSea: t < 0.5 ? r.wet[k] : r.wet[k + 1],
  };
}
