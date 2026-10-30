import type { Point, Terrain } from "@/lib/game/map";

/**
 * Where each building stands in the village, in px of the village's frame.
 *
 * Buildings used to be placed tile by tile on the land round your tribe. A
 * tribe settled out on the water had nowhere to put them (only two showed),
 * and on land they stood so close that their names only showed zoomed in.
 * Now the village has ground of its own in the middle of the frame (an
 * island, for a tribe out on the water), and its buildings stand in staggered
 * rows sized to the screen, each with room for its picture, name and level,
 * so the whole village reads at a glance.
 *
 * The Town Hall stands in the middle. Offices and stores crowd round it, the
 * military quarter near the City Gate at the front, workshops and fields at
 * the back, the Watchtower on a corner and the Harbor on the side facing the
 * water. The same frame and land always give the same village.
 */

export type Slot = { x: number; y: number; row: number };

export type VillageLayout = {
  width: number;
  height: number;
  cols: number;
  rows: number;
  /** Room each building has (px). */
  cellW: number;
  cellH: number;
  slots: Slot[];
};

/** Narrowest room a building and its name get; anything less and the names crowd. */
const MIN_CELL_W = 84;
/** Height a building with its name needs. */
const MIN_CELL_H = 84;

/** Staggered rows (c, c-1, c, ...) for `count` buildings across `width` px. */
export function villageLayout(width: number, count: number, minHeight = 0): VillageLayout {
  const cols = Math.max(3, Math.min(8, Math.floor(width / MIN_CELL_W)));
  let rows = 1;

  while (Math.ceil(rows / 2) * cols + Math.floor(rows / 2) * (cols - 1) < count) rows++;
  const cellW = width / cols;
  const height = Math.max(minHeight, rows * MIN_CELL_H + 16);
  const cellH = (height - 16) / rows;
  const slots: Slot[] = [];

  for (let r = 0; r < rows; r++) {
    const n = r % 2 ? cols - 1 : cols;

    for (let c = 0; c < n; c++) {
      slots.push({ x: (c + 0.5 + (n < cols ? 0.5 : 0)) * cellW, y: 8 + (r + 0.5) * cellH, row: r });
    }
  }

  return { width, height, cols, rows, cellW, cellH, slots };
}

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

/**
 * Which way the water lies from your tile (a unit vector, y down), or null
 * with no sea or lake within a few tiles.
 */
export function waterSide(home: Point, terrainAt: (x: number, y: number) => Terrain, reach = 6): Point | null {
  let x = 0;
  let y = 0;

  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) {
      const d = Math.hypot(dx, dy);

      if (!d || d > reach) continue;
      const t = terrainAt(home.x + dx, home.y + dy);

      if (t === "sea" || t === "lake") {
        x += dx / d / d;
        y += dy / d / d;
      }
    }
  const len = Math.hypot(x, y);

  return len > 0.05 ? { x: x / len, y: y / len } : null;
}

/** Each building's slot. `water`: which way the water lies (see waterSide). */
export function placeBuildings(layout: VillageLayout, ids: string[], water: Point | null = null): Record<string, Slot> {
  const { slots, cellW, cellH, rows, width, height } = layout;
  const mid = { x: width / 2, y: height / 2 };
  // Distance in rooms, so rows and columns count alike.
  const away = (s: Slot) => Math.hypot((s.x - mid.x) / cellW, (s.y - mid.y) / cellH);
  const free = new Set(slots.map((_, i) => i));
  const out: Record<string, Slot> = {};
  const wanted = new Set(ids);
  const take = (id: string, score: (s: Slot) => number) => {
    if (!wanted.has(id) || out[id]) return;
    let best = -1;

    for (const i of free) if (best < 0 || score(slots[i]) < score(slots[best]) - 1e-9) best = i;
    if (best < 0) return;
    free.delete(best);
    out[id] = slots[best];
  };
  const last = rows - 1;

  take("town-hall", away);
  // The front (bottom) edge: the gate in the middle of it.
  take("city-gate", (s) => (last - s.row) * 10 + Math.abs(s.x - mid.x) / cellW);
  if (water) {
    // On the side facing the water, as far out as it goes.
    take("harbor", (s) => -((s.x - mid.x) / cellW) * water.x - ((s.y - mid.y) / cellH) * water.y * 0.8);
  } else {
    take("harbor", (s) => (last - s.row) * 10 - Math.abs(s.x - mid.x) / cellW);
  }
  // A back corner, looking out over the land.
  take("watchtower", (s) => s.row * 10 - Math.abs(s.x - mid.x) / cellW);
  for (const id of CORE) take(id, away);
  // The military quarter: towards the gate, round the middle.
  for (const id of MILITARY) take(id, (s) => away(s) + ((mid.y - s.y) / cellH) * 0.6);
  // Workshops and fields: out at the back.
  for (const id of WORKS) take(id, (s) => -away(s) + ((s.y - mid.y) / cellH) * 0.8);
  // Anything else, wherever is left nearest the middle.
  for (const id of ids) take(id, away);

  return out;
}
