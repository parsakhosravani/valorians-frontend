import { Point, Terrain, hash, terrainAt } from "./map";

/**
 * The island of a tribe that settled at sea.
 *
 * A few tribes settled before the seas were charted, so their tile is open
 * water. The war map already calls it "an island of your own", but the land
 * under their village was painted as sea and no building could stand on it:
 * the village showed nothing but the Town Hall. Here the tiles of their own
 * claim rise out of the water as a small island, meadow with a fringe of
 * woods, so their village is painted and laid out like any other.
 *
 * Only how the land looks and where buildings stand: the world's terrain
 * (marches, sea routes, defense) is still `terrainAt`.
 */

/** How far the island reaches from the tribe's tile, in tiles (the claim is squashed the same way up and down). */
export const ISLAND_RADIUS = 2.45;
/** Tiles round the tribe whose painting the island changes: the island, plus the painter's look for the shore. */
export const ISLAND_REACH = 7;

type TerrainAt = (x: number, y: number) => Terrain;

/**
 * How your claim is drawn, as a stretch of its usual size: across (`w`) and
 * up and down (`h`). The war map draws it as it is; the village view makes
 * it taller, to give the buildings room on a phone's tall screen.
 */
export type ClaimShape = {
  w: number;
  h: number;
  /** Your City Gate's level, which the wall round the claim is built to (see wallLook). */
  wall?: number;
};
export const PLAIN_CLAIM: ClaimShape = { w: 1, h: 1 };

/**
 * The land round `home`, with its island raised when it sits on water (or the
 * mountain round it worn to hills); just `base` when it's on open land.
 * The island takes the claim's shape (see ClaimShape).
 */
export function islandTerrain(home: Point | null | undefined, base: TerrainAt = terrainAt, claim: ClaimShape = PLAIN_CLAIM): TerrainAt {
  // A tribe on water (the world was redrawn under it): an island of its own in the sea or lake.
  const wet = (t: string) => t === "sea" || t === "lake";

  if (!home) return base;
  const { x: hx, y: hy } = home;

  // A tribe on a mountain (likewise): the ground round its hall worn down to hills.
  if (base(hx, hy) === "mountains")
    return (x, y) => {
      const t = base(x, y);

      return t === "mountains" && Math.hypot((x - hx) / claim.w, (y - hy) / (0.92 * claim.h)) <= 1.6 ? "hills" : t;
    };
  if (!wet(base(hx, hy))) return base;

  return (x, y) => {
    const t = base(x, y);

    if (!wet(t)) return t;
    const d = Math.hypot((x - hx) / claim.w, (y - hy) / (0.92 * claim.h));

    if (d > ISLAND_RADIUS) return t;

    // Meadow in the middle; a few woods along the shore, the same ones every time.
    return d > 1.5 && hash(x, y, 71) < 0.3 ? "forest" : "plains";
  };
}
