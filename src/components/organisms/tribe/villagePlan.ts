import { claimEdge } from "@/components/organisms/war/landPaint";
import type { Point, Terrain } from "@/lib/game/map";

/**
 * Where each building stands in your village: on your own land, the land the
 * war map paints round your tribe, inside the gold border of your territory.
 *
 * The Town Hall stands on your tile. Offices and stores crowd round it, the
 * military quarter a little further out, and the workshops and fields go
 * where the land suits them: the Iron Mine up in the hills, the Sawmill by
 * the woods, the Harbor on the shore, the City Gate and the Watchtower on the
 * border. Nothing stands on mountains or water, or on a neighbour's village.
 *
 * Everything is in tiles from the centre of your tile, and the same land
 * always gives the same village.
 */

/** Where a building stands (its foot), in tiles from the centre of your tile. */
export type Plot = { x: number; y: number };

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

const BUILDABLE: Record<Terrain, boolean> = { plains: true, forest: true, hills: true, mountains: false, lake: false, sea: false };

type Spot = Plot & { d: number; th: number; edge: number; terrain: Terrain };

/**
 * `terrainAt`: the world's terrain. `neighbours`: other tribes' tiles nearby.
 * `ids`: the buildings to place (any not known here go with the core).
 */
export function villagePlan(
  home: Point,
  ids: string[],
  terrainAt: (x: number, y: number) => Terrain,
  neighbours: Point[] = [],
): VillagePlan {
  const ground = (p: Plot) => terrainAt(Math.round(home.x + p.x), Math.round(home.y + p.y));
  // How far the border is in this direction (the claim is a little squashed up and down).
  const edgeAt = (th: number) => Math.hypot(claimEdge(th).x, claimEdge(th).y);
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
  const spots: Spot[] = [];
  const step = 0.36;

  for (let j = -12; j <= 12; j++)
    for (let i = -12; i <= 12; i++) {
      const p = { x: (i + (j % 2 ? 0.5 : 0)) * step, y: j * step * 0.87 };
      const d = Math.hypot(p.x, p.y);
      const th = Math.atan2(p.y, p.x);
      const edge = edgeAt(th);
      const terrain = ground(p);

      if (d > edge + 1 || !BUILDABLE[terrain]) continue;
      if (neighbours.some((n) => Math.hypot(home.x + p.x - n.x, home.y + p.y - n.y) < 1.15)) continue;
      spots.push({ ...p, d, th, edge, terrain });
    }

  const plots: Record<string, Plot> = { "town-hall": { x: 0, y: 0 } };
  const taken = (s: Spot, room: number) =>
    Object.entries(plots).some(([id, p]) => Math.hypot(p.x - s.x, p.y - s.y) < (id === "town-hall" ? Math.max(room, HALL_ROOM) : room));
  /** Places a building on the lowest-scoring free spot (`inside`: within the border). */
  const place = (id: string, score: (s: Spot) => number, inside: boolean) => {
    for (const room of SPACING) {
      let best: Spot | null = null;
      let bestScore = Infinity;

      for (const s of spots) {
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
    if (inside) place(id, score, false);
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

  // Tracks: each building joined to the nearest one already reached, out from the Town Hall.
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

  return { plots, tracks };
}

/** The border of your territory as points (tiles from your tile's centre), all the way round. */
export const claimOutline = (steps = 64) =>
  Array.from({ length: steps + 1 }, (_, a) => claimEdge((a / steps) * Math.PI * 2));
