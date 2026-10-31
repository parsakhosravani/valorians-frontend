import { DRY, claimEdge, wetnessAt } from "@/components/organisms/war/landPaint";
import { ClaimShape, PLAIN_CLAIM } from "@/lib/game/island";
import type { Point, Terrain } from "@/lib/game/map";

/**
 * Where each building stands in your village: on your own land, the land the
 * war map paints round your tribe, inside the gold border of your territory.
 *
 * The Town Hall stands on your tile. Offices and stores crowd round it, the
 * military quarter a little further out, and the workshops and fields go
 * where the land suits them: the Iron Mine up in the hills, the Sawmill by
 * the woods, the Harbor on the shore, the City Gate and the Watchtower on the
 * border. Nothing stands on mountains or water, or on a neighbour's village
 * (nor so near the shore that the painted coast reaches under it),
 * unless there is no land left at all: then it stands on stilts over the
 * water rather than go missing.
 *
 * Everything is in tiles from the centre of your tile, and the same land
 * always gives the same village.
 */

/** Where a building stands (its foot), in tiles from the centre of your tile. */
export type Plot = { x: number; y: number };

/**
 * How roomy a village is laid out. `claim`: the shape the claim is drawn in
 * (see ClaimShape). `room`: room between buildings, as a stretch of the
 * usual. `rows`: how much closer buildings may stand one behind another
 * than side by side (1 = the same), since a building drawn behind another
 * hides only its foot, while one beside it hides it whole.
 */
export type Layout = { claim: ClaimShape; room: number; rows: number };
export const PLAIN_LAYOUT: Layout = { claim: PLAIN_CLAIM, room: 1, rows: 1 };

export type VillagePlan = {
  plots: Record<string, Plot>;
  /** Tracks between buildings, as pairs of building ids (each building reached once, from the Town Hall). */
  tracks: [string, string][];
};

/** Buildings closest to the Town Hall, in that order. */
const CORE = [
  "resource-warehouse",
  "treasury",
  "academy",
  "embassy",
  "trading-post",
  "war-hall",
  "hospital",
  "hideout",
  "exploration-center",
  "military-command",
];
const MILITARY = ["barracks", "stable", "arsenal", "armory", "siege-workshop", "trapmaker"];
const WORKS = ["iron-mine", "sawmill", "brickyard", "windmill", "fertilizer-workshop"];

/** Closest two buildings may stand, in tiles; tightened step by step only when the land runs out. */
const SPACING = [0.82, 0.72, 0.62];
/** The Town Hall is bigger: this much room round it. */
const HALL_ROOM = 1.05;

/** Points round a building's foot that must stand on dry land (tiles from the foot). */
const FOOT: [number, number][] = [[0, 0], [-0.36, -0.05], [0.36, -0.05], [-0.2, 0.12], [0.2, 0.12], [0, -0.28]];

const BUILDABLE: Record<Terrain, boolean> = { plains: true, forest: true, hills: true, mountains: false, lake: false, sea: false };

type Spot = Plot & { d: number; th: number; edge: number; terrain: Terrain };

/**
 * `terrainAt`: the world's terrain. `neighbours`: other tribes' tiles nearby.
 * `ids`: the buildings to place (any not known here go with the core).
 * `layout`: how roomy (see Layout); the village view spreads the town out
 * so every building can be seen.
 */
export function villagePlan(
  home: Point,
  ids: string[],
  terrainAt: (x: number, y: number) => Terrain,
  neighbours: Point[] = [],
  layout: Layout = PLAIN_LAYOUT,
): VillagePlan {
  const { claim, room: roomy, rows } = layout;
  const ground = (p: Plot) => terrainAt(Math.round(home.x + p.x), Math.round(home.y + p.y));
  // How far the border is in this direction (the claim is a little squashed up and down).
  const edgeAt = (th: number) => {
    const e = claimEdge(th, claim);

    return Math.hypot(e.x, e.y);
  };
  // Roomier when asked; if the land runs out, back to the usual room.
  const rooms = roomy > 1 ? [...SPACING.map((r) => r * roomy), ...SPACING] : SPACING;
  // Anything of a kind within `r` tiles of a spot.
  const near = (p: Plot, kinds: Terrain[], r: number) => {
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const q = { x: Math.round(p.x) + dx, y: Math.round(p.y) + dy };

        if (Math.hypot(q.x - p.x, q.y - p.y) <= r && kinds.includes(ground(q))) return true;
      }

    return false;
  };

  // Spots to build on: a fine triangular grid over the territory and a
  // little way past its border (workshops and fields may stand outside it).
  // A building's foot (its base, a little wider than the art's middle and a
  // little deep) on painted land: the coast is drawn ragged, so a spot on a
  // land tile can still have beach or water under part of the building.
  const onDryLand = (p: Plot) => FOOT.every(([dx, dy]) => wetnessAt(terrainAt, home.x + p.x + dx, home.y + p.y + dy) < DRY);
  const spots: Spot[] = [];
  // Mountains and water: only when the land has run out.
  const wet: Spot[] = [];
  const step = 0.36;

  const reach = Math.ceil(12 * Math.max(1, claim.w, claim.h));

  for (let j = -reach; j <= reach; j++)
    for (let i = -reach; i <= reach; i++) {
      const p = { x: (i + (j % 2 ? 0.5 : 0)) * step, y: j * step * 0.87 };
      const d = Math.hypot(p.x, p.y);
      const th = Math.atan2(p.y, p.x);
      const edge = edgeAt(th);
      const terrain = ground(p);

      if (d > edge + 1) continue;
      if (neighbours.some((n) => Math.hypot(home.x + p.x - n.x, home.y + p.y - n.y) < 1.15)) continue;
      (BUILDABLE[terrain] && onDryLand(p) ? spots : wet).push({ ...p, d, th, edge, terrain });
    }

  const plots: Record<string, Plot> = { "town-hall": { x: 0, y: 0 } };
  const taken = (s: Spot, room: number) =>
    Object.entries(plots).some(([id, p]) => Math.hypot(p.x - s.x, (p.y - s.y) * rows) < (id === "town-hall" ? HALL_ROOM * Math.max(1, room / SPACING[0]) : room));
  /** Places a building on the lowest-scoring free spot (`inside`: within the border). */
  const place = (id: string, score: (s: Spot) => number, inside: boolean, pool: Spot[] = spots) => {
    for (const room of rooms) {
      let best: Spot | null = null;
      let bestScore = Infinity;

      for (const s of pool) {
        if ((inside && s.d > s.edge - 0.25) || taken(s, room)) continue;
        // A whisker of the spot's own place breaks ties the same way every time.
        const v = score(s) + (s.x * 0.0007 + s.y * 0.0003);

        if (v < bestScore) {
          bestScore = v;
          best = s;
        }
      }
      if (best) {
        plots[id] = { x: best.x, y: best.y };

        return;
      }
    }
    // Squeezed by water all round: anywhere still free, inside or out.
    if (inside) place(id, score, false, pool);
    // No land left at all: on stilts over the water, so no building ever goes missing.
    else if (pool !== wet) place(id, score, false, wet);
  };

  const ring = (s: Spot, want: number) => Math.abs(s.d - want);
  // Out towards the border, measured on the border's own scale.
  const outer = (s: Spot) => Math.abs(s.d - s.edge * 0.95);
  const wanted = new Set(ids);
  const unknown = ids.filter((id) => id !== "town-hall" && ![...CORE, ...MILITARY, ...WORKS, "city-gate", "watchtower", "harbor"].includes(id));

  // The landmarks first: they want particular places on the border and shore.
  if (wanted.has("city-gate")) place("city-gate", (s) => Math.abs(s.d - s.edge) * 3 + (1 - Math.sin(s.th)) * 0.8, false);
  if (wanted.has("harbor")) {
    const coast = spots.some((s) => near(s, ["sea"], 1.2));

    place("harbor", (s) => (coast ? (near(s, ["sea"], 1.1) ? 0 : 5) + ring(s, s.edge) * 0.4 : outer(s) + 2 * Math.cos(s.th + 0.7)), false);
  }
  if (wanted.has("watchtower")) {
    place("watchtower", (s) => Math.abs(s.d - s.edge) * 3 + (1 + Math.sin(s.th)) * 0.6 + (s.terrain === "hills" ? -0.6 : 0), false);
  }
  for (const id of CORE.filter((c) => wanted.has(c)).concat(unknown)) place(id, (s) => s.d, true);
  for (const id of MILITARY.filter((c) => wanted.has(c))) place(id, (s) => ring(s, 1.8) + Math.max(0, Math.sin(s.th)) * -0.3, true);

  const works: Record<string, (s: Spot) => number> = {
    "iron-mine": (s) => (s.terrain === "hills" ? -1.4 : 0) + (near(s, ["mountains"], 1.3) ? -1 : 0),
    sawmill: (s) => (s.terrain === "forest" ? -1.2 : near(s, ["forest"], 1) ? -0.8 : 0),
    brickyard: (s) => (near(s, ["lake", "sea"], 1.3) ? -1 : 0) + (s.terrain === "hills" ? -0.3 : 0),
    windmill: (s) => (s.terrain === "plains" ? -1 : 0),
    "fertilizer-workshop": (s) => (s.terrain === "plains" ? -0.8 : 0),
  };

  for (const id of WORKS.filter((c) => wanted.has(c))) place(id, (s) => works[id](s) + outer(s) * 0.7, false);

  return { plots, tracks: trackTree(plots) };
}

/** The border of your territory as points (tiles from your tile's centre), all the way round. */
export const claimOutline = (steps = 64, claim: ClaimShape = PLAIN_CLAIM) =>
  Array.from({ length: steps + 1 }, (_, a) => claimEdge((a / steps) * Math.PI * 2, claim));

/**
 * The same village stood in tidy rows, so every building has a cell of its
 * own with room under it for its name: spots `w` tiles apart side by side,
 * `h` tiles row to row, every other row shifted half a spot, as many as there
 * are buildings in an oval `aspect` times as tall as wide (the shape of the
 * view). Each building takes the free spot nearest where it stood in the
 * village, inner ones first, so the offices still crowd the Town Hall in the
 * middle and the mine still keeps its side of town. Tracks run between
 * neighbours as before.
 */
export function tidyRows(plan: VillagePlan, w: number, h: number, aspect: number): VillagePlan {
  const ids = Object.keys(plan.plots);
  const reach = Math.ceil(Math.sqrt(ids.length)) + 2;
  const cells: Plot[] = [];

  for (let j = -reach; j <= reach; j++)
    for (let i = -reach; i <= reach; i++) cells.push({ x: (i + (Math.abs(j) % 2 ? 0.5 : 0)) * w, y: j * h });
  // How far out in a rounded-off rectangle (a squarer oval, so the rows come out even);
  // a whisker of the spot's own place breaks ties the same way every time.
  const far = (c: Plot) => (c.x ** 4 + (c.y / aspect) ** 4) ** 0.25 + c.x * 0.001 + c.y * 0.0003;
  const pool = cells.sort((a, b) => far(a) - far(b)).slice(0, ids.length);
  // The village scaled to the block's size, so "where it stood" is comparable.
  const size = (pts: Plot[]) => Math.max(...pts.map((p) => Math.hypot(p.x, p.y / aspect)), 0.001);
  const k = size(pool) / size(Object.values(plan.plots));
  const plots: Record<string, Plot> = {};
  const order = ids.sort((a, b) => Math.hypot(plan.plots[a].x, plan.plots[a].y) - Math.hypot(plan.plots[b].x, plan.plots[b].y));

  for (const id of order) {
    const want = { x: plan.plots[id].x * k, y: plan.plots[id].y * k };
    let best = 0;

    pool.forEach((c, n) => {
      if (Math.hypot(c.x - want.x, c.y - want.y) < Math.hypot(pool[best].x - want.x, pool[best].y - want.y)) best = n;
    });
    plots[id] = pool.splice(best, 1)[0];
  }

  return { plots, tracks: trackTree(plots) };
}

/** Tracks: each building joined to the nearest one already reached, out from the Town Hall. */
export function trackTree(plots: Record<string, Plot>): [string, string][] {
  const tracks: [string, string][] = [];
  const reached = ["town-hall"];
  const left = Object.keys(plots).filter((id) => id !== "town-hall");

  while (left.length) {
    let pick = 0;
    let from = "town-hall";
    let shortest = Infinity;

    left.forEach((id, k) => {
      for (const r of reached) {
        const d = Math.hypot(plots[id].x - plots[r].x, plots[id].y - plots[r].y);

        if (d < shortest) {
          shortest = d;
          pick = k;
          from = r;
        }
      }
    });
    const [id] = left.splice(pick, 1);

    tracks.push([from, id]);
    reached.push(id);
  }

  return tracks;
}
