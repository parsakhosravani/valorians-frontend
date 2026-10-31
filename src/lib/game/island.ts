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
  /** The land inside the border cleared for building: no water or mountains (the village view, where every spot is used). */
  cleared?: boolean;
};
export const PLAIN_CLAIM: ClaimShape = { w: 1, h: 1 };

/**
 * The land round `home`, with its island raised when it sits at sea; just `base` when it doesn't.
 * The island takes the claim's shape (see ClaimShape).
 */
export function islandTerrain(home: Point | null | undefined, base: TerrainAt = terrainAt, claim: ClaimShape = PLAIN_CLAIM): TerrainAt {
  const land = raised(home, base, claim);

  if (!home || !claim.cleared) return land;

  return (x, y) => {
    const t = land(x, y);

    if (t !== "lake" && t !== "sea" && t !== "mountains") return t;
    // Inside the border (its usual size, stretched as drawn), with a tile to spare.
    const d = Math.hypot((x - home.x) / claim.w, (y - home.y) / (0.92 * claim.h));

    return d <= CLEARED_RADIUS ? (t === "mountains" ? "hills" : "plains") : t;
  };
}

/** How far the cleared land reaches, in claim-stretched tiles: just past the border's furthest bulge. */
const CLEARED_RADIUS = 3.2;

function raised(home: Point | null | undefined, base: TerrainAt, claim: ClaimShape): TerrainAt {
  if (!home || base(home.x, home.y) !== "sea") return base;
  const { x: hx, y: hy } = home;

  return (x, y) => {
    const t = base(x, y);

    if (t !== "sea") return t;
    const d = Math.hypot((x - hx) / claim.w, (y - hy) / (0.92 * claim.h));

    if (d > ISLAND_RADIUS) return t;

    // Meadow in the middle; a few woods along the shore, the same ones every time.
    return d > 1.5 && hash(x, y, 71) < 0.3 ? "forest" : "plains";
  };
}
