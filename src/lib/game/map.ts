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
  SCOUT_COST_PER_TILE,
  SCOUT_MIN_COST,
  unitSlots,
} from "./config";
import { NORTH, lonLat, northGrid } from "./northMap";
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

/**
 * The world is the real North of the Viking age (see northMap): its seas,
 * coasts and great lakes are where they really are. Inside the land the
 * country is still drawn tile by tile from noise, but leaning the way the
 * real land does: mountains along the Norwegian spine, in Iceland, the
 * Scottish Highlands, the Alps and the Carpathians, and hardly anywhere else;
 * deep forest across Sweden, Finland and the lands round the Baltic; bare
 * ground in Iceland and the far north.
 */
const wetAt = (x: number, y: number) => {
  const i = x - MAP_MIN;
  const j = y - MAP_MIN;

  return i < 0 || j < 0 || i >= NORTH.size || j >= NORTH.size ? 0 : northGrid()[j * NORTH.size + i];
};

export const seaAt = (x: number, y: number) => wetAt(x, y) === 0;

/** Distance (in degrees, longitude halved as on the map) from a point to a chain of points. */
const toChain = (lon: number, lat: number, chain: [number, number][]) => {
  let best = Infinity;

  for (let k = 0; k + 1 < chain.length; k++) {
    const [ax, ay] = chain[k];
    const [bx, by] = chain[k + 1];
    const dx = (bx - ax) * 0.5;
    const dy = by - ay;
    const px = (lon - ax) * 0.5;
    const py = lat - ay;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));

    best = Math.min(best, Math.hypot(px - t * dx, py - t * dy));
  }

  return best;
};

/** The great mountain chains: [chain of lon/lat points, half-width in degrees]. */
const RANGES: [[number, number][], number][] = [
  // The Scandinavian mountains, down the spine of Norway into Lapland.
  [[[6.6, 58.7], [7.4, 60], [8.6, 61.6], [11, 63.1], [13.4, 65], [15.6, 66.8], [18, 68.3], [21.5, 69.6], [26, 70.2]], 1.3],
  [[[-22, 64.6], [-18.6, 64.9], [-15.5, 65]], 1.1], // Iceland's highlands
  [[[-6.4, 56.6], [-4.4, 57.4], [-4.2, 58.3]], 0.75], // the Scottish Highlands
  [[[-4, 52.8], [-3.6, 51.9]], 0.4], // the Welsh hills
  [[[5.8, 45.5], [8, 46.3], [11, 46.7], [14, 47.1]], 1], // the Alps
  [[[17.5, 49.4], [21, 49.2], [24.5, 48], [25.6, 46.8]], 0.8], // the Carpathians
];

/** How mountainous, how wooded and how bare the land is around each tile (worked out once). */
let LEAN: { relief: Float32Array; wood: Float32Array; bare: Float32Array } | null = null;

const lean = () => {
  if (LEAN) return LEAN;
  const n = NORTH.size;
  const relief = new Float32Array(n * n);
  const wood = new Float32Array(n * n);
  const bare = new Float32Array(n * n);

  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const { lon, lat } = lonLat(i, j);
      let r = 0;

      for (const [chain, width] of RANGES) r = Math.max(r, 1 - toChain(lon, lat, chain) / width);
      const k = j * n + i;

      relief[k] = Math.max(0, r);
      // The boreal forest: Sweden, Finland and the shores of the Baltic, thinning north and west.
      wood[k] = lat > 55 && lat < 67 && lon > 11 ? Math.min(1, (lon - 11) / 4) * Math.min(1, (67 - lat) / 3) : 0.3;
      // Treeless: Iceland, the Faroes and the far north.
      bare[k] = lon < -6 && lat > 61 ? 1 : lat > 69 ? Math.min(1, (lat - 69) / 2) : 0;
    }
  LEAN = { relief, wood, bare };

  return LEAN;
};

export function terrainAt(x: number, y: number): Terrain {
  const wet = wetAt(x, y);

  if (wet === 0) return "sea";
  if (wet === 2) return "lake";
  const k = (y - MAP_MIN) * NORTH.size + (x - MAP_MIN);
  const { relief, wood, bare } = lean();
  const r = relief[k];
  const peak = noise(x, y, 7) * 0.85 + noise(x, y, 9, 2) * 0.15;
  const n = noise(x, y, 7) * 0.7 + hash(x, y, 9) * 0.3;
  const ridge = r > 0.35 && 1 - Math.abs(2 * noise(x, y, 31, 11) - 1) > 0.93 && noise(x, y, 33, 4) > 0.35;

  // Massifs where the chains run, solid at their heart; long ridges with passes through them.
  if (peak > 0.9 - 0.42 * r || ridge) return "mountains";
  if (n > 0.66 - 0.22 * r) return "hills";
  if (n < 0.3 + 0.18 * wood[k] - 0.25 * bare[k]) return "forest";

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
export function seaRoute(a: Point, b: Point, units?: Army | null) {
  // Flying, there's no sea to cross.
  if (units && isFlight(units)) {
    const d = distance(a, b);

    return { naval: false, sea: 0, land: d, distance: d };
  }
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

/**
 * How good a spot is to settle, as the Norse chose: by the sea above all (a
 * beach for the ships), or on a lake shore, on open farmland or the edge of
 * the woods; less in the hills, little in the bare far north or the deep
 * south of the Frankish lands. 0 where nobody can settle at all.
 */
export function siteScore(p: Point): number {
  if (!inMap(p)) return 0;
  const t = terrainAt(p.x, p.y);

  if (unsettled(t)) return 0;
  let s = t === "plains" ? 1 : t === "forest" ? 0.8 : 0.5;
  let sea = false;
  let lake = false;

  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const n = terrainAt(p.x + dx, p.y + dy);

      if (n === "sea") sea = true;
      if (n === "lake") lake = true;
    }
  if (sea) s *= 4;
  else if (lake) s *= 2;
  const { lat } = lonLat(p.x - MAP_MIN, p.y - MAP_MIN);

  // The far north is hard living; the deep south is Frankish land, raided more than settled.
  if (lat > 68) s *= 0.4;
  if (lat < 52) s *= 0.5;

  return s;
}

/** Least distance (tiles) between two tribes' homes. */
export const HOME_SPACING = 5;
/** New tribes settle within about this many tiles of another, so nobody starts alone at the edge of the world. */
export const HOME_NEAR = 22;

/**
 * Where a new tribe settles: somewhere random on the map, picked the way the
 * Norse picked (siteScore: shores first), at least HOME_SPACING from every
 * other tribe, and within reach of others (HOME_NEAR) once there are any, so
 * the world fills out from the first villages in natural, uneven clusters
 * along coasts and lakes rather than on a grid. `taken`: every tribe's home.
 * Returns null if no spot can be found (the world is full).
 */
export function pickHomeSite(taken: Point[], rand: () => number = Math.random, tries = 600): Point | null {
  // Tribes bucketed by area, so spacing checks stay cheap with thousands of them.
  const B = 16;
  const buckets = new Map<string, Point[]>();

  for (const t of taken) {
    const k = `${Math.floor(t.x / B)},${Math.floor(t.y / B)}`;

    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(t);
  }
  const nearest = (p: Point, reach: number) => {
    let best = Infinity;
    const r = Math.ceil(reach / B);
    const bx = Math.floor(p.x / B);
    const by = Math.floor(p.y / B);

    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        for (const t of buckets.get(`${bx + dx},${by + dy}`) ?? []) best = Math.min(best, distance(p, t));

    return best;
  };
  const picks: { p: Point; w: number }[] = [];

  for (let i = 0; i < tries && picks.length < 40; i++) {
    // Anywhere near a tribe (or, for the first, near the middle of the map).
    const from = taken.length ? taken[Math.floor(rand() * taken.length)] : { x: MAP_CENTER, y: MAP_CENTER };
    const a = rand() * Math.PI * 2;
    const r = HOME_SPACING + rand() * (HOME_NEAR - HOME_SPACING);
    const p = { x: Math.round(from.x + Math.cos(a) * r), y: Math.round(from.y + Math.sin(a) * r) };
    const w = siteScore(p);

    if (w <= 0 || nearest(p, HOME_SPACING) < HOME_SPACING) continue;
    picks.push({ p, w });
  }
  // A weighted draw: good shores far more often, but anywhere decent now and then;
  // never a valley the mountains wall off from the tribes around it.
  while (picks.length) {
    let roll = rand() * picks.reduce((n, c) => n + c.w, 0);
    let k = picks.length - 1;

    for (let i = 0; i < picks.length; i++) {
      roll -= picks[i].w;
      if (roll <= 0) {
        k = i;
        break;
      }
    }
    const [{ p }] = picks.splice(k, 1);
    const near = taken.length
      ? taken.reduce((a, b) => (distance(a, p) <= distance(b, p) ? a : b))
      : { x: MAP_CENTER, y: MAP_CENTER };

    if (!marchRoute(near, p).climbed) return p;
  }

  return null;
}

/**
 * A better spot for a village already on the map (laid out on the old grid,
 * or on ground the redrawn world turned to water or mountain): the best place
 * near where it stands, picked like a new settler's (siteScore, shores
 * first), so it moves only a little and its neighbours stay its neighbours.
 * Looks within `reach` tiles (further for a village now on water or a
 * mountain, to find the nearest good land), keeps `spacing` from every
 * village already resettled or staying (`placed`), and never into a valley
 * the mountains wall off. Stays put if nowhere nearby will do.
 */
export function resettleSpot(from: Point, placed: Point[], rand: () => number = Math.random, reach = 4, spacing = 4): Point {
  const t = terrainAt(from.x, from.y);
  const far = reach >= 18 ? reach : t === "sea" || t === "lake" ? 12 : t === "mountains" ? 7 : reach;
  const near = placed.filter((q) => Math.abs(q.x - from.x) <= far + spacing && Math.abs(q.y - from.y) <= far + spacing);
  const clear = (p: Point) => near.every((q) => distance(p, q) >= spacing);
  const options: { p: Point; w: number }[] = [];

  for (let dy = -far; dy <= far; dy++)
    for (let dx = -far; dx <= far; dx++) {
      const d = Math.hypot(dx, dy);

      if (d > far) continue;
      const p = { x: from.x + dx, y: from.y + dy };
      const score = siteScore(p);

      if (score <= 0 || !clear(p)) continue;
      // Good ground close to home wins; a dash of chance so villages don't line up again.
      options.push({ p, w: score * (1 - (d / (far + 1)) * 0.6) * (0.6 + rand() * 0.8) });
    }
  options.sort((a, b) => b.w - a.w);
  for (const o of options.slice(0, 6)) if (unsettled(t) || !marchRoute(from, o.p).climbed) return o.p;
  // Still on water or a mountain with no room near: look further, and settle a little closer to the others.
  if (unsettled(t) && reach < 18) return resettleSpot(from, placed, rand, 18, 3);

  return from;
}

/** About how many tribes the world holds: its good land, at the spacing tribes keep. */
let CAPACITY = 0;

export const worldCapacity = () => {
  if (CAPACITY) return CAPACITY;
  let land = 0;

  for (let y = MAP_MIN; y < MAP_MAX; y += 2) for (let x = MAP_MIN; x < MAP_MAX; x += 2) if (!unsettled(terrainAt(x, y))) land += 4;
  CAPACITY = Math.round(land / (HOME_SPACING * HOME_SPACING * 1.3));

  return CAPACITY;
};

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
const troopSlots = (units: Army) => UNITS.reduce((n, u) => n + unitSlots(u) * (units[u.id] ?? 0), 0);

/** Longships it takes to carry this army across the sea. */
export const shipsNeeded = (units: Army) => Math.ceil(troopSlots(units) / SHIP.transport!);

/** Seconds per tile at sea. */
const SAIL_SECONDS_PER_TILE = UNIT_BY_ID[SHIP.id].speed;

/**
 * One-way time in ms from `from` to `to` along the army's road: the land part
 * at the army's walking pace (slower over rough ground), the sea part at
 * sailing speed.
 */
export function routeMs(units: Army, from: Point, to: Point, marchMultiplier = 1) {
  const r = seaRoute(from, to, units);
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

/** Only flyers (the dragon) and their ships: they fly straight, whatever's below. */
export const isFlight = (units: Army) => {
  let flyers = 0;

  for (const u of UNITS) {
    const n = units[u.id] ?? 0;

    if (!n || u.transport) continue;
    if (!u.flying) return false;
    flyers += n;
  }

  return flyers > 0;
};

/** A flight: a straight line from `a` to `b`, a point a tile, never at sea, nothing in the way. */
export function flightRoute(a: Point, b: Point): MarchRoute {
  const d = distance(a, b);
  const n = Math.max(1, Math.ceil(d));
  const path = Array.from({ length: n + 1 }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }));

  return {
    path,
    wet: path.map(() => false),
    steps: Array.from({ length: n }, () => [d / n, 0] as [number, number]),
    land: d,
    sea: 0,
    naval: false,
    length: n,
    distance: d,
    detour: false,
    climbed: false,
  };
}

/** The way this army goes from `a` to `b`: flying straight if it's all flyers, else by road. */
export const routeFor = (units: Army | null | undefined, a: Point, b: Point) =>
  units && isFlight(units) ? flightRoute(a, b) : marchRoute(a, b);

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
