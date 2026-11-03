/**
 * Outpost land: what the ground round an outpost favours, and which spots to
 * offer a tribe founding one. Pure and shared by client and server.
 */
import { OUTPOST, RESOURCE_IDS, ResourceId } from "./config";
import { Point, Terrain, distance, terrainAt } from "./map";

/** What each kind of land yields more of: woods give wood, hills clay, peaks iron, open land and water crop (fields and fish). */
export const LAND_RESOURCE: Record<Terrain, ResourceId> = {
  forest: "wood",
  hills: "clay",
  mountains: "iron",
  plains: "crop",
  lake: "crop",
  sea: "crop",
};

/** An outpost's land bonus: +percent% to one of its fields. */
export type OutpostLand = { resource: ResourceId; percent: number };

/**
 * The land round tile (x, y): its own tile and the 8 next to it. The resource
 * most of them favour wins (ties: the outpost's own tile, then the usual order),
 * +landBonusPerTile% per tile of it, up to landBonusMax%.
 */
export function outpostLand(x: number, y: number, at: (x: number, y: number) => Terrain = terrainAt): OutpostLand {
  const count = Object.fromEntries(RESOURCE_IDS.map((r) => [r, 0])) as Record<ResourceId, number>;

  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) count[LAND_RESOURCE[at(x + dx, y + dy)]]++;
  const own = LAND_RESOURCE[at(x, y)];
  const resource = RESOURCE_IDS.reduce((best, r) => (count[r] > count[best] || (count[r] === count[best] && r === own && best !== own) ? r : best), own);

  return { resource, percent: Math.min(OUTPOST.landBonusMax, OUTPOST.landBonusPerTile * count[resource]) };
}

export type OutpostSpot = Point & { distance: number; land: OutpostLand };

/**
 * The spots offered when founding an outpost, from `candidates` (free tiles,
 * nearest first): the best land for each resource (highest bonus, then
 * nearest), so the player chooses what their outpost is for. Nearest first.
 */
export function outpostSpots(home: Point, candidates: Point[], at?: (x: number, y: number) => Terrain): OutpostSpot[] {
  const best = new Map<ResourceId, OutpostSpot>();

  for (const p of candidates) {
    const land = outpostLand(p.x, p.y, at);
    const d = distance(home, p);
    const had = best.get(land.resource);

    if (!had || land.percent > had.land.percent || (land.percent === had.land.percent && d < had.distance))
      best.set(land.resource, { x: p.x, y: p.y, distance: d, land });
  }

  return [...best.values()].sort((a, b) => a.distance - b.distance).slice(0, OUTPOST.spotChoices);
}
