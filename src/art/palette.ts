/**
 * Material colours for the art. Each material has three tones:
 * top (lit), left (+y face, half lit) and right (+x face, in shade).
 * Keep new materials to the same ~12% / ~25% darkening steps.
 */
export type Material = { top: string; left: string; right: string };

export const OUTLINE = "#2B1F15";

export const MAT = {
  // Ground
  grass: { top: "#93B95C", left: "#6F9543", right: "#577734" },
  dirt: { top: "#D2B27E", left: "#B08F5C", right: "#8E7146" },
  cobble: { top: "#C9BFAE", left: "#A79C88", right: "#857B69" },
  rock: { top: "#B3ADA3", left: "#8F897F", right: "#6E6962" },
  water: { top: "#6FA9C2", left: "#4F879F", right: "#3B6A7E" },

  // Walls
  stone: { top: "#DDD3C0", left: "#BCB09A", right: "#978B76" },
  darkStone: { top: "#9C968C", left: "#7E7870", right: "#625D57" },
  plaster: { top: "#F3E9D6", left: "#E2D3B6", right: "#BDAB8A" },
  wood: { top: "#C99A63", left: "#A87A47", right: "#835C33" },
  darkWood: { top: "#8A6342", left: "#6C4B30", right: "#523823" },
  brick: { top: "#D9825C", left: "#B9603C", right: "#924A2D" },

  // Roofs
  thatch: { top: "#EBC874", left: "#D3AA54", right: "#AD873B" },
  redRoof: { top: "#E07B52", left: "#C2593A", right: "#9A4229" },
  slate: { top: "#7C93A8", left: "#5F7489", right: "#4A5B6D" },
  greenRoof: { top: "#8FB07A", left: "#6C8E5B", right: "#536F45" },

  // Metals and cloth
  gold: { top: "#FFD978", left: "#F0B847", right: "#C88E2C" },
  iron: { top: "#B9C2CA", left: "#949FAA", right: "#717C88" },
  cloth: { top: "#F7EEDC", left: "#E8DBC1", right: "#C8B796" },
  redCloth: { top: "#E66A4C", left: "#C94B32", right: "#A23A26" },
  blueCloth: { top: "#79A7D0", left: "#5785B0", right: "#41698F" },
  hay: { top: "#F0D27A", left: "#D9B556", right: "#B8923C" },

  // Plants
  pine: { top: "#4F8A4A", left: "#3F7340", right: "#2E5932" },
  leaf: { top: "#9CC66A", left: "#6FA04A", right: "#4F7F36" },
  crop: { top: "#E9CC62", left: "#CFAE45", right: "#A98B32" },
} satisfies Record<string, Material>;
