import { ClaimShape, PLAIN_CLAIM, islandTerrain } from "@/lib/game/island";
import { Terrain } from "@/lib/game/map";

/**
 * The land under the war map, painted onto canvases in square pieces (see
 * "Pieces" at the end) and handed to the camera as small pictures.
 *
 * 1. Ground, all painted the same way, lit from the top-left:
 *    - water with a ragged, crisp coastline, beach and foam, light in the
 *      shallows and dark far out;
 *    - woods as a canopy of rounded tree crowns, with an edge that fades into
 *      the meadow and the odd autumn grove;
 *    - mountains as ridged rock rising out of foothills, snow on the crests;
 *    - rolling, lumpy hills.
 * 2. Flat things on the ground: cleared earth under settlements, your territory,
 *    grass on the plains.
 */
//
// Painted on the page or in the ground worker (ground.worker.ts): nothing here
// touches the page except through makeCanvas, which uses an OffscreenCanvas
// wherever there is one.

export const TILE = 46; // tile size in px at zoom 1

export type V3 = [number, number, number];

/**
 * A canvas to paint on: an OffscreenCanvas where there is one, so the same
 * painting runs in the ground worker (see paintBlob) as well as on the page.
 * The two are drawn with the same calls, so both are typed as the page's.
 */
const makeCanvas = (w: number, h: number) => {
  const c: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });

  return { c: c as HTMLCanvasElement, g: c.getContext("2d") as CanvasRenderingContext2D };
};

const LAND: Record<"plains" | "forest" | "hills" | "mountains", V3> = {
  plains: [0x7a, 0x86, 0x45],
  forest: [0x3a, 0x55, 0x2c],
  hills: [0x8f, 0x7c, 0x52],
  mountains: [0x6c, 0x60, 0x50],
};
const MEADOW: V3 = [0xa8, 0xa0, 0x5a];
const SHADE: V3 = [0x3e, 0x50, 0x2a];
const SAND: V3 = [0xd2, 0xbb, 0x84];
const WETSAND: V3 = [0xa8, 0x90, 0x60];
const SHALLOW: V3 = [0x3f, 0x8f, 0x98];
const DEEP: V3 = [0x14, 0x34, 0x4c];
const LAKE_SHALLOW: V3 = [0x4f, 0x98, 0x96];
const LAKE_DEEP: V3 = [0x26, 0x5c, 0x6a];
const FOAM: V3 = [0xe8, 0xf1, 0xe6];
const CANOPY_FLOOR: V3 = [0x1c, 0x2e, 0x18];
const PINE_DARK: V3 = [0x2c, 0x4c, 0x26];
const PINE: V3 = [0x3c, 0x63, 0x2d];
const PINE_LIGHT: V3 = [0x58, 0x7a, 0x34];
const GOLD: V3 = [0xb8, 0x8c, 0x2e];
const RUST: V3 = [0x9c, 0x4e, 0x22];
const ROCK_LOW: V3 = [0x5e, 0x52, 0x43];
const ROCK_HIGH: V3 = [0x80, 0x78, 0x6e];
const SNOW: V3 = [0xee, 0xf1, 0xf3];

const mixV = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const wet = (t: Terrain) => t === "sea" || t === "lake";

/** Deterministic 0..1 per spot, so the map looks the same on every visit. */
const rnd = (x: number, y: number, k: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453;

  return s - Math.floor(s);
};

/** A fast integer hash, 0..1: the noise below calls it hundreds of thousands of times. */
const hash = (x: number, y: number, s: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;

  h = Math.imul(h ^ (h >>> 13), 1274126177);

  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Smooth value noise in world space. */
const vnoise = (x: number, y: number, seed: number) => {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  const fx = x - gx;
  const fy = y - gy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(gx, gy, seed);
  const b = hash(gx + 1, gy, seed);
  const c = hash(gx, gy + 1, seed);
  const d = hash(gx + 1, gy + 1, seed);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};

const fbm = (x: number, y: number, seed: number) =>
  vnoise(x, y, seed) * 0.5 + vnoise(x * 2.1, y * 2.1, seed + 1) * 0.3 + vnoise(x * 4.3, y * 4.3, seed + 2) * 0.2;

/**
 * The edge of your territory at angle `th`, in tiles from your tile's centre
 * (about two and a half tiles out, a little squashed up and down). The map
 * paints it; the village lays its buildings out inside it.
 */
export const claimEdge = (th: number, claim: ClaimShape = PLAIN_CLAIM) => {
  const r = 2.6 + (fbm(Math.cos(th) * 2 + 9, Math.sin(th) * 2 + 9, 3) - 0.5) * 0.9;

  return { x: Math.cos(th) * r * claim.w, y: Math.sin(th) * r * 0.92 * claim.h };
};

/**
 * Tree crowns: the nearest of one jittered point per cell. Returns the
 * distance to it and which cell it is, so each crown keeps its own colour.
 */
const crowns = (x: number, y: number): [number, number] => {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  let best = 9;
  let cell = 0;

  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const cx = gx + dx;
      const cy = gy + dy;
      const px = cx + 0.15 + hash(cx, cy, 51) * 0.7;
      const py = cy + 0.15 + hash(cx, cy, 52) * 0.7;
      const d = (x - px) * (x - px) + (y - py) * (y - py);

      if (d < best) {
        best = d;
        cell = cx * 7919 + cy;
      }
    }

  return [Math.sqrt(best), cell];
};

const sstep = (a: number, b: number, x: number) => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);

  return t * t * (3 - 2 * t);
};

// ─── What stands on the land ─────────────────────────────────────────────────

type Pt = { x: number; y: number };
const parse = (s: string): Pt[] =>
  s
    ? s.split(";").map((p) => {
        const [x, y] = p.split(",").map(Number);

        return { x, y };
      })
    : [];

type Scene = {
  ox: number;
  oy: number;
  n: number;
  occupied: Set<string>;
  home: Pt | null;
  claim: ClaimShape;
};

/** Terrain and per-tile facts with a margin, for neighbours and blending. */
const MARGIN = 4;

const survey = ({ ox, oy, n, home, claim }: Scene) => {
  const W = n + MARGIN * 2;
  const ter: Terrain[] = new Array(W * W);
  // Your land, with the island raised under it if you settled at sea.
  const ground = islandTerrain(home, undefined, claim);

  for (let j = 0; j < W; j++)
    for (let i = 0; i < W; i++) ter[j * W + i] = ground(ox + i - MARGIN, oy + j - MARGIN);

  const id = (i: number, j: number) => {
    const a = Math.min(W - 1, Math.max(0, i + MARGIN));
    const b = Math.min(W - 1, Math.max(0, j + MARGIN));

    return b * W + a;
  };
  const at = (i: number, j: number) => ter[id(i, j)];

  const WET = new Float32Array(W * W);
  const LAKE = new Float32Array(W * W);
  const ELEV = new Float32Array(W * W);
  const MTN = new Float32Array(W * W);
  const FOR = new Float32Array(W * W);
  const HIL = new Float32Array(W * W);
  const DIST = new Float32Array(W * W);
  const COL = new Float32Array(W * W * 3);

  for (let k = 0; k < W * W; k++) {
    const t = ter[k];
    const w = wet(t);

    WET[k] = w ? 1 : 0;
    LAKE[k] = t === "lake" ? 1 : 0;
    MTN[k] = t === "mountains" ? 1 : 0;
    FOR[k] = t === "forest" ? 1 : 0;
    HIL[k] = t === "hills" ? 1 : 0;
    ELEV[k] = t === "mountains" ? 1 : t === "hills" ? 0.45 : t === "forest" ? 0.12 : w ? -0.2 : 0;
    const c = LAND[w ? "plains" : (t as keyof typeof LAND)];

    COL[k * 3] = c[0];
    COL[k * 3 + 1] = c[1];
    COL[k * 3 + 2] = c[2];
    // How far (in tiles) to the other side of the shore: depth at sea, beaches on land.
    let best = 9;
    const i = k % W;
    const j = (k - i) / W;

    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const a = i + dx;
        const b = j + dy;

        if (a < 0 || b < 0 || a >= W || b >= W) continue;
        if (wet(ter[b * W + a]) !== w) best = Math.min(best, Math.hypot(dx, dy));
      }
    DIST[k] = best;
  }

  return { W, at, id, WET, LAKE, ELEV, DIST, COL, MTN, FOR, HIL };
};

type Survey = ReturnType<typeof survey>;

// ─── 1. Ground ───────────────────────────────────────────────────────────────

/** Samples per tile: the whole-view pieces as sharp as the old whole map, close-ups much finer. */
const samplesPerTile = (detail: boolean) => (detail ? 44 : 26);

const paintSoil = (s: Scene, v: Survey, detail: boolean) => {
  const { ox, oy, n } = s;
  const { W, WET, LAKE, ELEV, DIST, COL, MTN, FOR, HIL } = v;
  const S = samplesPerTile(detail);
  const w = n * S;
  // One extra sample all round: the light is worked out from the neighbours,
  // so a piece shades its edges exactly as the piece next to it does.
  const P = w + 2;
  const rgb = new Float32Array(P * P * 3);
  /** A field read at a bent spot: forests and ranges lose the tile grid's corners. */
  const bent = (f: Float32Array, fx: number, fy: number) => {
    const x = fx - 0.5;
    const y = fy - 0.5;
    const i0 = Math.floor(x);
    const j0 = Math.floor(y);
    const tx = sstep(0, 1, x - i0);
    const ty = sstep(0, 1, y - j0);
    const a = (j0 + MARGIN) * W + i0 + MARGIN;

    return (
      (f[a] ?? 0) * (1 - tx) * (1 - ty) +
      (f[a + 1] ?? 0) * tx * (1 - ty) +
      (f[a + W] ?? 0) * (1 - tx) * ty +
      (f[a + W + 1] ?? 0) * tx * ty
    );
  };
  const elev = new Float32Array(P * P);

  for (let qy = 0; qy < P; qy++) {
    const sy = qy - 1;
    const fy = (sy + 0.5) / S;
    const y = fy - 0.5;
    const j0 = Math.floor(y);
    const ty = sstep(0, 1, y - j0);
    const r0 = (j0 + MARGIN) * W;
    const r1 = r0 + W;
    const wy = oy + fy;

    for (let qx = 0; qx < P; qx++) {
      const sx = qx - 1;
      const fx = (sx + 0.5) / S;
      const x = fx - 0.5;
      const i0 = Math.floor(x);
      const tx = sstep(0, 1, x - i0);
      const a = r0 + i0 + MARGIN;
      const b = a + 1;
      const c = r1 + i0 + MARGIN;
      const d = c + 1;
      const wa = (1 - tx) * (1 - ty);
      const wb = tx * (1 - ty);
      const wc = (1 - tx) * ty;
      const wd = tx * ty;
      const bil = (f: Float32Array) => f[a] * wa + f[b] * wb + f[c] * wc + f[d] * wd;
      const wx = ox + fx;
      const o = qy * P + qx;

      elev[o] = bil(ELEV);
      // A ragged, organic coast: the water field nudged by noise.
      const wv = bil(WET) + (fbm(wx * 1.3, wy * 1.3, 5) - 0.5) * 0.42;
      let R: number;
      let G: number;
      let B: number;

      if (wv > 0.5) {
        const lake = bil(LAKE) > 0.5;
        const depth = sstep(0.4, 3.2, bil(DIST) + (wv - 0.5) * 2);
        const lo = lake ? LAKE_SHALLOW : SHALLOW;
        const hi = lake ? LAKE_DEEP : DEEP;

        R = lo[0] + (hi[0] - lo[0]) * depth;
        G = lo[1] + (hi[1] - lo[1]) * depth;
        B = lo[2] + (hi[2] - lo[2]) * depth;
        // Long soft swells out at sea.
        const swell = Math.max(0, Math.sin(wx * 2.2 + wy * 1.1 + fbm(wx, wy, 9) * 6) - 0.6) * 0.12 * depth;

        R += (255 - R) * swell;
        G += (255 - G) * swell;
        B += (255 - B) * swell;
        // Foam hugging the shore.
        const foam = (1 - sstep(0.5, 0.58, wv)) * 0.75;

        R += (FOAM[0] - R) * foam;
        G += (FOAM[1] - G) * foam;
        B += (FOAM[2] - B) * foam;
      } else {
        R = COL[a * 3] * wa + COL[b * 3] * wb + COL[c * 3] * wc + COL[d * 3] * wd;
        G = COL[a * 3 + 1] * wa + COL[b * 3 + 1] * wb + COL[c * 3 + 1] * wc + COL[d * 3 + 1] * wd;
        B = COL[a * 3 + 2] * wa + COL[b * 3 + 2] * wb + COL[c * 3 + 2] * wc + COL[d * 3 + 2] * wd;
        // Big sunny meadows and shady patches, then fine brush texture.
        const big = fbm(wx * 0.35, wy * 0.35, 11) - 0.5;
        const tone = big > 0 ? MEADOW : SHADE;
        const k = Math.abs(big) * 0.35;
        const fine = 1 + (vnoise(wx * 5, wy * 5, 12) - 0.5) * 0.12;

        R = (R + (tone[0] - R) * k) * fine;
        G = (G + (tone[1] - G) * k) * fine;
        B = (B + (tone[2] - B) * k) * fine;
        // Hills: rolling ground, lumpy under the light.
        const hl = bil(HIL);

        if (hl > 0.05) elev[o] += hl * (fbm(wx * 2.3, wy * 2.3, 25) - 0.3) * 0.5;

        // Woods, painted like the sea: a canopy with a ragged edge that fades
        // into the meadow, made of rounded tree crowns lit from the top-left.
        const bx = fx + (fbm(wx * 0.9, wy * 0.9, 61) - 0.5) * 0.9;
        const by = fy + (fbm(wx * 0.9, wy * 0.9, 62) - 0.5) * 0.9;
        const fv = bent(FOR, bx, by) + (fbm(wx * 1.4, wy * 1.4, 41) - 0.5) * 0.45;
        const kf = sstep(0.4, 0.62, fv);

        if (kf > 0) {
          const [dist, cell] = crowns(wx * 3.6, wy * 3.6);
          // Crowns overlap: only the narrow gaps between them show the dark floor.
          const dome = Math.max(0, 1 - dist / 0.78);
          const hue = hash(cell, 7, 53);
          const grove = fbm(wx * 0.2, wy * 0.2, 77) > 0.66 && hue < 0.6;
          const leaf = grove ? (hue < 0.3 ? GOLD : RUST) : hue < 0.33 ? PINE_DARK : hue < 0.75 ? PINE : PINE_LIGHT;
          const body = 0.78 + dome * 0.22;
          const gap = 1 - sstep(0, 0.22, dome);
          const tr = leaf[0] * body + (CANOPY_FLOOR[0] - leaf[0] * body) * gap;
          const tg = leaf[1] * body + (CANOPY_FLOOR[1] - leaf[1] * body) * gap;
          const tb = leaf[2] * body + (CANOPY_FLOOR[2] - leaf[2] * body) * gap;

          R += (tr - R) * kf;
          G += (tg - G) * kf;
          B += (tb - B) * kf;
          // The canopy stands above the ground, each crown a dome the light catches.
          elev[o] += kf * (0.3 + Math.sqrt(dome) * 0.35);
        }

        // Mountains, painted the same way: ridged rock that rises out of the
        // land, bare and brown low down, grey higher, snow on the tops.
        const mtn = bent(MTN, bx, by);
        const mv = mtn + (fbm(wx * 1.2, wy * 1.2, 43) - 0.5) * 0.5 + (vnoise(wx * 3.5, wy * 3.5, 44) - 0.5) * 0.22;
        const foot = sstep(0.15, 0.45, mv);
        const km = sstep(0.35, 0.62, mv);

        elev[o] += foot * 0.3;
        if (km > 0) {
          const ridge = 1 - Math.abs(2 * fbm(wx * 2, wy * 2, 21) - 1);
          const crag = 1 - Math.abs(2 * vnoise(wx * 4.5, wy * 4.5, 23) - 1);
          const core = sstep(0.6, 1, mtn);
          const h = km * (0.15 + ridge * 0.35 + crag * 0.15 + core * 0.35);
          const rock = mixV(ROCK_LOW, ROCK_HIGH, sstep(0.25, 0.75, h));
          // Snow only on the high crests, thinning out down the slopes.
          const snow = sstep(0.9, 0.98, h + (vnoise(wx * 5, wy * 5, 27) - 0.5) * 0.1) * 0.75;

          R += (rock[0] + (SNOW[0] - rock[0]) * snow - R) * km;
          G += (rock[1] + (SNOW[1] - rock[1]) * snow - G) * km;
          B += (rock[2] + (SNOW[2] - rock[2]) * snow - B) * km;
          elev[o] += h * 1.2;
        }
        // A beach, then wet sand right at the water.
        const beach = sstep(0.18, 0.42, wv) * 0.9;

        R += (SAND[0] - R) * beach;
        G += (SAND[1] - G) * beach;
        B += (SAND[2] - B) * beach;
        const damp = sstep(0.44, 0.5, wv) * 0.7;

        R += (WETSAND[0] - R) * damp;
        G += (WETSAND[1] - G) * damp;
        B += (WETSAND[2] - B) * damp;
      }
      rgb[o * 3] = R;
      rgb[o * 3 + 1] = G;
      rgb[o * 3 + 2] = B;
    }
  }

  // Hill-shade: light from the top-left gives the land its relief.
  const { c, g } = makeCanvas(w, w);
  const img = g.createImageData(w, w);
  const k = 0.088 * S;

  for (let sy = 0; sy < w; sy++)
    for (let sx = 0; sx < w; sx++) {
      const o = (sy + 1) * P + sx + 1;
      const dx = elev[o + 1] - elev[o - 1];
      const dy = elev[o + P] - elev[o - P];
      const shade = Math.max(0.5, Math.min(1.32, 1 + (-dx - dy) * k));
      const p = (sy * w + sx) * 4;

      img.data[p] = rgb[o * 3] * shade;
      img.data[p + 1] = rgb[o * 3 + 1] * shade;
      img.data[p + 2] = rgb[o * 3 + 2] * shade;
      img.data[p + 3] = 255;
    }
  g.putImageData(img, 0, 0);

  return c;
};

/** Fine grain, like brush strokes on canvas. */
let grain: HTMLCanvasElement | null = null;
const grainTile = () => {
  if (grain) return grain;
  const { c, g } = makeCanvas(128, 128);
  const img = g.createImageData(128, 128);

  for (let k = 0; k < img.data.length; k += 4) {
    const v = rnd(k, 3, 5) > 0.5 ? 255 : 0;

    img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
    img.data[k + 3] = rnd(k, 7, 9) * 26;
  }
  g.putImageData(img, 0, 0);

  return (grain = c);
};

// ─── 2. Flat things on the ground ────────────────────────────────────────────

const paintFlat = (
  g: CanvasRenderingContext2D,
  s: Scene,
  v: Survey,
) => {
  const T = TILE;
  const { ox, oy, n, occupied } = s;
  const px = (x: number) => (x - ox) * T + T / 2;
  const py = (y: number) => (y - oy) * T + T / 2;

  g.save();
  g.globalCompositeOperation = "soft-light";
  g.fillStyle = g.createPattern(grainTile(), "repeat")!;
  g.fillRect(0, 0, n * T, n * T);
  g.restore();

  // Grass tufts on the plains, in two strokes for the whole map.
  const light = new Path2D();
  const dark = new Path2D();

  // A ring of tiles beyond the edge too: tufts lean over into the next piece.
  for (let j = -1; j <= n; j++)
    for (let i = -1; i <= n; i++) {
      if (v.at(i, j) !== "plains") continue;
      const x = ox + i;
      const y = oy + j;

      for (let k = 0; k < 4; k++) {
        const ax = i * T + rnd(x, y, 100 + k) * T;
        const ay = j * T + rnd(x, y, 110 + k) * T;
        const p = rnd(x, y, 120 + k) > 0.5 ? light : dark;

        for (const d of [-3, 0, 3]) {
          p.moveTo(ax + d, ay);
          p.quadraticCurveTo(ax + d, ay - 4, ax + d * 1.6, ay - 7);
        }
      }
    }
  g.lineWidth = 1.2;
  g.lineCap = "round";
  g.strokeStyle = "rgba(190,200,110,0.5)";
  g.stroke(light);
  g.strokeStyle = "rgba(40,60,24,0.4)";
  g.stroke(dark);

  // Cleared, trodden earth under every settlement and camp.
  for (const key of occupied) {
    const [x, y] = key.split(",").map(Number);
    const cx = px(x);
    const cy = py(y) + 6;
    const grad = g.createRadialGradient(cx, cy, 2, cx, cy, 30);

    grad.addColorStop(0, "rgba(120,98,64,0.75)");
    grad.addColorStop(0.65, "rgba(110,90,58,0.45)");
    grad.addColorStop(1, "rgba(110,90,58,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(cx, cy, 30, 22, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Your land: a soft gold claim behind a timber palisade.
  if (s.home) {
    const cx = px(s.home.x);
    const cy = py(s.home.y);
    const edge = new Path2D();
    const line: Pt[] = [];

    for (let a = 0; a <= 128; a++) {
      const th = (a / 128) * Math.PI * 2;
      const e = claimEdge(th, s.claim);
      const X = cx + e.x * T;
      const Y = cy + e.y * T;

      line.push({ x: X, y: Y });
      if (a) edge.lineTo(X, Y);
      else edge.moveTo(X, Y);
    }
    g.save();
    g.fillStyle = "rgba(240,190,90,0.07)";
    g.fill(edge);
    g.restore();
    paintPalisade(g, s, line);
  }
};

/** Wall stakes this far apart along the border (px at zoom 1). */
const STAKE_GAP = 4.6;

/** Painted ground wetter than this is wet sand or water: no wall stakes or buildings stand there. */
export const DRY = 0.42;

/**
 * How wet the ground is painted at world point (x, y), in tiles with each
 * tile's centre on whole numbers, worked out exactly as paintSoil does it:
 * over 0.5 is water, a little under is wet sand. `ground` is the terrain the
 * land is painted from (the world's, with your island if you have one).
 */
export const wetnessAt = (ground: (x: number, y: number) => Terrain, x: number, y: number) => {
  const i0 = Math.floor(x);
  const j0 = Math.floor(y);
  const tx = sstep(0, 1, x - i0);
  const ty = sstep(0, 1, y - j0);
  const w = (i: number, j: number) => (wet(ground(i, j)) ? 1 : 0);
  const bil = w(i0, j0) * (1 - tx) * (1 - ty) + w(i0 + 1, j0) * tx * (1 - ty) + w(i0, j0 + 1) * (1 - tx) * ty + w(i0 + 1, j0 + 1) * tx * ty;

  return bil + (fbm((x + 0.5) * 1.3, (y + 0.5) * 1.3, 5) - 0.5) * 0.42;
};

/**
 * What the wall round your land is built of, from your City Gate's level:
 * every five levels it's built up. A timber palisade to begin with (0–4),
 * then a stone wall with battlements (5–9), stone with towers (10–14), dark
 * granite with slate-roofed towers flying banners (15–19), and from 20 pale
 * dressed stone with gilded roofs that keeps going: every five levels more,
 * the wall stands a little taller and its towers a little closer, without end.
 */
export type WallLook = {
  stone: boolean;
  /** A tower every this many stones (0: none). */
  towers: number;
  roof: string | null;
  banner: boolean;
  /** Height of the wall (px at zoom 1). */
  height: number;
  /** Stone colour, dark to light. */
  rock: [V3, V3];
};

export const wallLook = (gate = 0): WallLook => {
  const tier = Math.floor(Math.max(0, gate) / 5);
  const past = Math.max(0, tier - 4);

  if (tier === 0) return { stone: false, towers: 0, roof: null, banner: false, height: 8, rock: [[0x6e, 0x4a, 0x28], [0x8f, 0x66, 0x3a]] };
  if (tier === 1) return { stone: true, towers: 0, roof: null, banner: false, height: 9, rock: [[0x7a, 0x75, 0x6c], [0x9e, 0x98, 0x8c]] };
  if (tier === 2) return { stone: true, towers: 14, roof: "#6B3F22", banner: false, height: 10, rock: [[0x7a, 0x75, 0x6c], [0x9e, 0x98, 0x8c]] };
  if (tier === 3) return { stone: true, towers: 12, roof: "#3D4F6B", banner: true, height: 11, rock: [[0x52, 0x59, 0x63], [0x6f, 0x77, 0x82]] };

  return {
    stone: true,
    towers: Math.max(6, 11 - past),
    roof: "#B8862E",
    banner: true,
    height: 12 + 2 * Math.log2(1 + past),
    rock: [[0xb0, 0xa5, 0x8f], [0xd4, 0xca, 0xb2]],
  };
};

/**
 * The wall round your land along the border (see wallLook), lit from the
 * top-left like the land. It stops at the water's edge (no stakes in the sea
 * or a lake) and ends there in a stout post or a tower. Buildings on the
 * border (the City Gate, the Watchtower) stand in it.
 */
const paintPalisade = (g: CanvasRenderingContext2D, s: Scene, line: Pt[]) => {
  const look = wallLook(s.claim.wall);
  type Stake = { x: number; y: number; post: boolean; tone: number; k: number };
  const stakes: Stake[] = [];
  // Stakes evenly along the border, whatever its bends.
  let carry = 0;
  let k = 0;

  for (let a = 1; a < line.length; a++) {
    const p = line[a - 1];
    const q = line[a];
    const len = Math.hypot(q.x - p.x, q.y - p.y);

    for (let d = carry; d < len; d += STAKE_GAP) {
      const t = d / len;
      const x = p.x + (q.x - p.x) * t;
      const y = p.y + (q.y - p.y) * t;

      stakes.push({ x, y, post: look.stone ? look.towers > 0 && k % look.towers === 0 : k % 9 === 0, tone: rnd(Math.round(x * 3), Math.round(y * 3), 131), k });
      k++;
    }
    carry = (carry - len) % STAKE_GAP;
    if (carry < 0) carry += STAKE_GAP;
  }

  // Dry stakes only; where the wall meets water, the last one on land is a post.
  const ground = islandTerrain(s.home, undefined, s.claim);
  const dry = stakes.map((st) => wetnessAt(ground, s.ox + st.x / TILE - 0.5, s.oy + st.y / TILE - 0.5) < DRY);
  const wall = stakes.filter((st, i) => {
    if (!dry[i]) return false;
    const n = stakes.length;

    if (!dry[(i + 1) % n] || !dry[(i - 1 + n) % n]) st.post = true;

    return true;
  });

  if (!wall.length) return;

  if (look.stone) {
    paintStoneWall(g, look, wall);

    return;
  }

  // Its shadow on the ground, falling to the bottom-right.
  const shade = new Path2D();

  for (const st of wall) {
    shade.moveTo(st.x + 5, st.y + 1.2);
    shade.ellipse(st.x + 2, st.y + 1.2, 3.2, 1.7, 0, 0, Math.PI * 2);
  }
  g.fillStyle = "rgba(20,14,6,0.38)";
  g.fill(shade);

  // A rail tying the stakes together, behind them.
  g.beginPath();
  for (let i = 0; i < wall.length; i++) {
    const st = wall[i];
    const prev = wall[(i - 1 + wall.length) % wall.length];
    const joined = i > 0 && Math.hypot(st.x - prev.x, st.y - prev.y) < STAKE_GAP * 1.6;

    if (joined) g.lineTo(st.x, st.y - 4.5);
    else g.moveTo(st.x, st.y - 4.5);
  }
  g.lineWidth = 1.6;
  g.lineCap = "round";
  g.strokeStyle = "#3E2A16";
  g.stroke();

  // The stakes, back to front so nearer ones overlap those behind.
  for (const st of [...wall].sort((a, b) => a.y - b.y)) {
    const w = st.post ? 2.8 : 2;
    const h = st.post ? 10.5 : 8 + st.tone * 1.4;
    const wood = mixV([0x6e, 0x4a, 0x28], [0x8f, 0x66, 0x3a], st.tone);
    const top = st.y - h;

    g.beginPath();
    g.moveTo(st.x - w, st.y);
    g.lineTo(st.x - w, top);
    g.lineTo(st.x, top - (st.post ? 2 : 3));
    g.lineTo(st.x + w, top);
    g.lineTo(st.x + w, st.y);
    g.closePath();
    g.fillStyle = `rgb(${wood.map(Math.round).join(",")})`;
    g.fill();
    g.lineWidth = 0.7;
    g.strokeStyle = "rgba(34,22,10,0.85)";
    g.stroke();
    // Light on the left face, and the fresh-cut point.
    g.fillStyle = "rgba(255,228,170,0.22)";
    g.fillRect(st.x - w + 0.4, top + 0.5, w * 0.6, h - 1);
    g.beginPath();
    g.moveTo(st.x - w, top);
    g.lineTo(st.x, top - (st.post ? 2 : 3));
    g.lineTo(st.x + w, top);
    g.closePath();
    g.fillStyle = "#C89E66";
    g.fill();
    if (st.post) {
      // An iron band round the posts.
      g.fillStyle = "rgba(40,36,32,0.85)";
      g.fillRect(st.x - w, st.y - h * 0.62, w * 2, 1.2);
    }
  }
};

/** A stone wall: dressed blocks with battlements, and towers where the look has them. */
const paintStoneWall = (g: CanvasRenderingContext2D, look: WallLook, wall: { x: number; y: number; post: boolean; tone: number; k: number }[]) => {
  const half = STAKE_GAP / 2 + 0.45;
  const colour = (tone: number, shade = 0) =>
    `rgb(${mixV(look.rock[0], look.rock[1], tone)
      .map((c) => Math.round(c * (1 - shade)))
      .join(",")})`;

  // Its shadow on the ground, falling to the bottom-right.
  g.fillStyle = "rgba(20,14,6,0.4)";
  g.beginPath();
  for (const st of wall) {
    g.moveTo(st.x + 6.5, st.y + 1.5);
    g.ellipse(st.x + 2.5, st.y + 1.5, st.post ? 6 : 4, 2, 0, 0, Math.PI * 2);
  }
  g.fill();

  // Back to front so nearer stones overlap those behind.
  for (const st of [...wall].sort((a, b) => a.y - b.y)) {
    if (st.post) {
      paintTower(g, look, st, colour);
      continue;
    }
    const h = look.height + st.tone * 0.8;
    const top = st.y - h;

    g.fillStyle = colour(st.tone);
    g.fillRect(st.x - half, top, half * 2, h);
    // Mortar: a course line, and a joint that steps every other stone.
    g.fillStyle = "rgba(30,26,22,0.35)";
    g.fillRect(st.x - half, top + h * 0.5, half * 2, 0.6);
    g.fillRect(st.x + (st.k % 2 ? -half * 0.3 : half * 0.4), top + (st.k % 2 ? 0 : h * 0.5), 0.6, h * 0.5);
    // Light on the top.
    g.fillStyle = "rgba(255,240,210,0.25)";
    g.fillRect(st.x - half, top, half * 2, 1.1);
    // Battlements: every other stone stands up a merlon.
    if (st.k % 2 === 0) {
      g.fillStyle = colour(st.tone, 0.05);
      g.fillRect(st.x - half * 0.75, top - 2.6, half * 1.5, 2.8);
      g.fillStyle = "rgba(255,240,210,0.25)";
      g.fillRect(st.x - half * 0.75, top - 2.6, half * 1.5, 0.8);
    }
    g.fillStyle = "rgba(20,16,12,0.25)";
    g.fillRect(st.x + half - 0.8, top, 0.8, h);
  }
};

/** A round tower in the wall: a stone drum, a cone roof, and a banner on the grandest walls. */
const paintTower = (
  g: CanvasRenderingContext2D,
  look: WallLook,
  st: { x: number; y: number; tone: number; k: number },
  colour: (tone: number, shade?: number) => string,
) => {
  const r = 3.9;
  const h = look.height + 5;
  const top = st.y - h;

  g.fillStyle = colour(st.tone, 0.08);
  g.fillRect(st.x - r, top, r * 2, h);
  g.beginPath();
  g.ellipse(st.x, st.y, r, 1.4, 0, 0, Math.PI);
  g.fill();
  // Lit on the left, in shade on the right, a slit window.
  g.fillStyle = "rgba(255,240,210,0.22)";
  g.fillRect(st.x - r, top, r * 0.7, h);
  g.fillStyle = "rgba(20,16,12,0.3)";
  g.fillRect(st.x + r * 0.45, top, r * 0.55, h);
  g.fillStyle = "rgba(15,12,10,0.8)";
  g.fillRect(st.x - 0.5, top + h * 0.35, 1, 2.4);

  if (!look.roof) return;
  const peak = top - 6.5;

  g.beginPath();
  g.moveTo(st.x - r - 1, top + 0.5);
  g.lineTo(st.x, peak);
  g.lineTo(st.x + r + 1, top + 0.5);
  g.closePath();
  g.fillStyle = look.roof;
  g.fill();
  g.lineWidth = 0.6;
  g.strokeStyle = "rgba(20,14,8,0.7)";
  g.stroke();
  g.fillStyle = "rgba(255,240,210,0.25)";
  g.beginPath();
  g.moveTo(st.x - r - 1, top + 0.5);
  g.lineTo(st.x, peak);
  g.lineTo(st.x - 0.6, top + 0.5);
  g.closePath();
  g.fill();

  if (!look.banner) return;
  g.strokeStyle = "#2A1E12";
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(st.x, peak);
  g.lineTo(st.x, peak - 5);
  g.stroke();
  g.fillStyle = st.k % 2 ? "#A4302A" : "#C9A040";
  g.beginPath();
  g.moveTo(st.x, peak - 5);
  g.lineTo(st.x + 4, peak - 4);
  g.lineTo(st.x, peak - 3);
  g.closePath();
  g.fill();
};

/** What a piece is painted from: plain values, so it can be sent to the worker. */
export type PieceJob = {
  x: number;
  y: number;
  n: number;
  occupied: string;
  home: string;
  detail: boolean;
  res: number;
  /** How your claim is drawn (see ClaimShape); as it is when left out. */
  claim?: ClaimShape;
};

/**
 * Paints one piece of land and returns it as a small compressed picture. Runs
 * in the ground worker (ground.worker.ts) where the browser can, else here.
 */
export const paintBlob = async ({ x, y, n, occupied, home, detail, res, claim = PLAIN_CLAIM }: PieceJob): Promise<Blob | null> => {
  const scene: Scene = { ox: x, oy: y, n, occupied: new Set(occupied ? occupied.split(";") : []), home: parse(home)[0] ?? null, claim };
  const size = n * TILE;
  const { c, g } = makeCanvas(Math.round(size * res), Math.round(size * res));

  if (!g) return null;
  g.setTransform(res, 0, 0, res, 0, 0);
  const v = survey(scene);

  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(paintSoil(scene, v, detail), 0, 0, size, size);
  paintFlat(g, scene, v);
  if ("convertToBlob" in c) return (c as unknown as OffscreenCanvas).convertToBlob({ type: "image/webp", quality: 0.9 });

  return new Promise((resolve) =>
    c.toBlob(
      (blob) => {
        c.width = c.height = 0;
        resolve(blob);
      },
      "image/webp",
      0.9,
    ),
  );
};
