/**
 * Where each building stands in the village, in "map pixels" (0..780 × 0..1160).
 * North is the military quarter, the Town Hall sits on the plaza, the economy
 * lives around it, fields to the south and the gate on the palisade.
 */
export const MAP_W = 780;
export const MAP_H = 1160;

export const PLOTS: Record<string, { x: number; y: number; s?: number }> = {
  "exploration-center": { x: 110, y: 175 },
  watchtower: { x: 390, y: 165, s: 120 },
  "iron-mine": { x: 670, y: 180 },
  "siege-workshop": { x: 120, y: 330 },
  "military-command": { x: 290, y: 320 },
  "war-hall": { x: 490, y: 320 },
  sawmill: { x: 665, y: 335 },
  barracks: { x: 115, y: 480 },
  stable: { x: 255, y: 470 },
  armory: { x: 525, y: 470 },
  arsenal: { x: 670, y: 485 },
  "town-hall": { x: 390, y: 590, s: 170 },
  trapmaker: { x: 105, y: 645 },
  treasury: { x: 245, y: 655 },
  academy: { x: 540, y: 655 },
  brickyard: { x: 680, y: 650 },
  hideout: { x: 110, y: 810 },
  "resource-warehouse": { x: 255, y: 815 },
  "trading-post": { x: 395, y: 805 },
  embassy: { x: 540, y: 815 },
  hospital: { x: 685, y: 810 },
  windmill: { x: 210, y: 975, s: 125 },
  "fertilizer-workshop": { x: 430, y: 970 },
  "city-gate": { x: 390, y: 1125, s: 150 },
};

export const DEFAULT_PLOT_SIZE = 116;

/** Map pixels per world unit in the 3D scene. */
export const UNIT = 20;

/** Map pixels → 3D world (x, z), centred on the village. */
export const toWorld = (x: number, y: number) => ({ x: (x - MAP_W / 2) / UNIT, z: (y - 630) / UNIT });

/** Road centre lines in map pixels. */
export const ROADS: [number, number][][] = [
  [[390, 600], [390, 1125]],
  [[390, 590], [390, 165]],
  [[110, 330], [665, 330]],
  [[110, 655], [250, 638], [390, 632], [530, 638], [680, 655]],
  [[110, 815], [685, 815]],
  [[390, 180], [670, 180]],
];

/** River centre line in map pixels (runs off the map at both ends). */
export const RIVER: [number, number][] = [
  [860, 200], [800, 360], [745, 500], [735, 650], [690, 760], [750, 905], [800, 1040], [790, 1160], [770, 1320],
];

/** The palisade: an ellipse around the village with the gate at the bottom. */
export const WALL = { cx: 390, cy: 630, rx: 350, ry: 495 };
