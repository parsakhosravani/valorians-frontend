"use client";
import { memo, useEffect, useRef, useState } from "react";
import clsx from "clsx";

import { Terrain, terrainAt } from "@/lib/game/map";

/**
 * The land under the war map, painted once onto a canvas and handed to the
 * camera as one picture.
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

export const TILE = 46; // tile size in px at zoom 1

type V3 = [number, number, number];

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
};

/** Terrain and per-tile facts with a margin, for neighbours and blending. */
const MARGIN = 4;

const survey = ({ ox, oy, n }: Scene) => {
  const W = n + MARGIN * 2;
  const ter: Terrain[] = new Array(W * W);

  for (let j = 0; j < W; j++)
    for (let i = 0; i < W; i++) ter[j * W + i] = terrainAt(ox + i - MARGIN, oy + j - MARGIN);

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

/** Samples per tile: as many as a phone can afford for this much map. */
const samplesPerTile = (n: number, detail: boolean) =>
  detail
    ? Math.max(16, Math.min(56, Math.floor(Math.sqrt(1_400_000) / n)))
    : Math.max(8, Math.min(26, Math.floor(Math.sqrt(1_000_000) / n)));

const paintSoil = (s: Scene, v: Survey, detail: boolean) => {
  const { ox, oy, n } = s;
  const { W, WET, LAKE, ELEV, DIST, COL, MTN, FOR, HIL } = v;
  const S = samplesPerTile(n, detail);
  const w = n * S;
  const rgb = new Float32Array(w * w * 3);
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
  const elev = new Float32Array(w * w);

  for (let sy = 0; sy < w; sy++) {
    const fy = (sy + 0.5) / S;
    const y = fy - 0.5;
    const j0 = Math.floor(y);
    const ty = sstep(0, 1, y - j0);
    const r0 = (j0 + MARGIN) * W;
    const r1 = r0 + W;
    const wy = oy + fy;

    for (let sx = 0; sx < w; sx++) {
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
      const o = sy * w + sx;

      elev[o] = bil(ELEV);
      // A ragged, organic coast: the water field nudged by noise.
      const wv = bil(WET) + (fbm(wx * 1.3, wy * 1.3, 5) - 0.5) * 0.42;
      let R: number;
      let G: number;
      let B: number;

      if (wv > 0.5) {
        // Lake water fades into sea water where they meet (a hard switch
        // left square patches along the tile grid).
        const lake = sstep(0.2, 0.8, bil(LAKE) + (fbm(wx * 1.6, wy * 1.6, 15) - 0.5) * 0.3);
        const depth = sstep(0.4, 3.2, bil(DIST) + (wv - 0.5) * 2);
        const lo = mixV(SHALLOW, LAKE_SHALLOW, lake);
        const hi = mixV(DEEP, LAKE_DEEP, lake);

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
  const c = document.createElement("canvas");

  c.width = c.height = w;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, w);
  const k = 0.088 * S;

  for (let sy = 0; sy < w; sy++)
    for (let sx = 0; sx < w; sx++) {
      const o = sy * w + sx;
      const dx = elev[sy * w + Math.min(w - 1, sx + 1)] - elev[sy * w + Math.max(0, sx - 1)];
      const dy = elev[Math.min(w - 1, sy + 1) * w + sx] - elev[Math.max(0, sy - 1) * w + sx];
      const shade = Math.max(0.5, Math.min(1.32, 1 + (-dx - dy) * k));
      const p = o * 4;

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
  const c = document.createElement("canvas");

  c.width = c.height = 128;
  const g = c.getContext("2d")!;
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

  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
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

  // Your land: a soft gold claim with a dashed border.
  if (s.home) {
    const cx = px(s.home.x);
    const cy = py(s.home.y);
    const edge = new Path2D();

    for (let a = 0; a <= 64; a++) {
      const th = (a / 64) * Math.PI * 2;
      const r = T * (2.6 + (fbm(Math.cos(th) * 2 + 9, Math.sin(th) * 2 + 9, 3) - 0.5) * 0.9);
      const X = cx + Math.cos(th) * r;
      const Y = cy + Math.sin(th) * r * 0.92;

      if (a) edge.lineTo(X, Y);
      else edge.moveTo(X, Y);
    }
    g.save();
    g.fillStyle = "rgba(240,190,90,0.10)";
    g.fill(edge);
    g.setLineDash([7, 5]);
    g.lineWidth = 2.2;
    g.strokeStyle = "rgba(255,214,130,0.75)";
    g.shadowColor = "rgba(0,0,0,0.5)";
    g.shadowBlur = 3;
    g.stroke(edge);
    g.restore();
  }
};

/** Pixels the ground canvas may use: big enough to stay crisp, small enough for phones. */
const MAX_PIXELS = 11_000_000;

export const MapGround = memo(function MapGround({
  ox,
  oy,
  n,
  occupied,
  home = "",
  detail = false,
}: {
  ox: number;
  oy: number;
  n: number;
  /** "x,y" tiles with a tribe or camp: no trees drawn under them. */
  occupied: string;
  /** "x,y" of your tribe: your territory is drawn round it. */
  home?: string;
  /**
   * A close-up: a small piece of the map painted at full detail, laid over
   * the whole-map picture where you've zoomed in, so the land stays sharp.
   */
  detail?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The finished picture and the piece of world it shows: while the next one
  // paints (after the map moves), the last one stays where its land is.
  const [pic, setPic] = useState<{ url: string; ox: number; oy: number; size: number } | null>(null);
  const src = pic?.url ?? null;
  const [shown, setShown] = useState<string | null>(null);
  const size = n * TILE;

  useEffect(() => {
    const c = ref.current;

    if (!c || !n) return;
    const dpr = window.devicePixelRatio || 1;
    const scale = detail
      ? Math.min(dpr * 2.2, Math.sqrt(MAX_PIXELS / 3) / size)
      : Math.max(0.75, Math.min(dpr * 1.25, 2.5, Math.sqrt(MAX_PIXELS) / size));
    const scene: Scene = {
      ox,
      oy,
      n,
      occupied: new Set(occupied ? occupied.split(";") : []),
      home: parse(home)[0] ?? null,
    };
    let live = true;

    c.width = Math.round(size * scale);
    c.height = Math.round(size * scale);
    const g = c.getContext("2d");

    if (!g) return;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    const v = survey(scene);

    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(paintSoil(scene, v, detail), 0, 0, size, size);
    paintFlat(g, scene, v);
    // Hand the finished picture over as an image: the browser tiles an
    // image and only moves the tiles when the map pans or zooms, while a
    // big canvas gets re-sent to the GPU on every frame.
    c.toBlob(
      (blob) => {
        if (!live || !blob) return;
        setPic({ url: URL.createObjectURL(blob), ox, oy, size });
      },
      "image/webp",
      0.9,
    );

    return () => {
      live = false;
    };
  }, [ox, oy, n, size, occupied, home, detail]);

  // Free a picture only once the next one is up: a phone may drop a decoded
  // image from memory and fetch it again, and a freed one comes back blank.
  const kept = useRef<string | null>(null);

  useEffect(() => {
    if (!shown || kept.current === shown) return;
    if (kept.current) URL.revokeObjectURL(kept.current);
    kept.current = shown;
  }, [shown]);
  useEffect(
    () => () => {
      if (kept.current) URL.revokeObjectURL(kept.current);
    },
    [],
  );

  return (
    <>
      <canvas
        ref={ref}
        aria-hidden="true"
        className={clsx("absolute left-0 top-0", shown && shown === src && "hidden")}
        style={{ width: size, height: size }}
      />
      {pic && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          aria-hidden="true"
          className="absolute max-w-none"
          decoding="async"
          draggable={false}
          src={pic.url}
          onLoad={() => {
            setShown(pic.url);
            // The picture is up: free the canvas's memory.
            if (ref.current) ref.current.width = ref.current.height = 0;
          }}
          style={{ left: (pic.ox - ox) * TILE, top: (pic.oy - oy) * TILE, width: pic.size, height: pic.size }}
        />
      )}
    </>
  );
});
