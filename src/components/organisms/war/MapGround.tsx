"use client";
import { memo, useEffect, useRef, useState } from "react";
import clsx from "clsx";

import { Terrain, marchRoute, terrainAt } from "@/lib/game/map";

/**
 * The land under the war map, painted once onto a canvas and handed to the
 * camera as one picture.
 *
 * 1. Ground: biome colours blended tile to tile, brushed with noise, lit from
 *    the top-left so hills and mountains have relief. Water gets a ragged,
 *    crisp coastline with a beach and a foam line, light in the shallows and
 *    dark far out.
 * 2. Flat things on the ground: cleared earth under settlements, roads along
 *    the routes armies really march, your territory, fields round villages,
 *    grass on the plains.
 * 3. The painted terrain icons, back to front: woods of overlapping trees,
 *    low warm hills, and snowy peaks big enough to join into ranges.
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

const sstep = (a: number, b: number, x: number) => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);

  return t * t * (3 - 2 * t);
};

// ─── Icons ───────────────────────────────────────────────────────────────────

type Icons = {
  forest: CanvasImageSource;
  hills: CanvasImageSource;
  mountains: CanvasImageSource;
};

const load = (src: string) =>
  new Promise<HTMLImageElement>((ok, fail) => {
    const img = new window.Image();

    img.decoding = "async";
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = src;
  });

/** Hills are the mountain's rock, low and warm; the peaks keep their snow. */
const warm = (img: HTMLImageElement) => {
  const c = document.createElement("canvas");

  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d")!;

  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = "rgba(120, 92, 48, 0.55)";
  g.fillRect(0, 0, c.width, c.height);

  return c;
};

let icons: Promise<Icons> | null = null;
const loadIcons = () =>
  (icons ??= Promise.all([
    load("/images/icons/forest.webp"),
    load("/images/icons/mountain.webp"),
  ])
    .then(([forest, mountain]) => ({ forest, hills: warm(mountain), mountains: mountain }))
    .catch((e) => {
      icons = null;
      throw e;
    }));

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
  villages: Pt[];
  roads: Pt[];
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
  const DIST = new Float32Array(W * W);
  const COL = new Float32Array(W * W * 3);

  for (let k = 0; k < W * W; k++) {
    const t = ter[k];
    const w = wet(t);

    WET[k] = w ? 1 : 0;
    LAKE[k] = t === "lake" ? 1 : 0;
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

  return { W, at, id, WET, LAKE, ELEV, DIST, COL };
};

type Survey = ReturnType<typeof survey>;

// ─── 1. Ground ───────────────────────────────────────────────────────────────

/** Samples per tile: as many as a phone can afford for this much map. */
const samplesPerTile = (n: number) => Math.max(8, Math.min(20, Math.floor(Math.sqrt(650_000) / n)));

const paintSoil = (s: Scene, v: Survey) => {
  const { ox, oy, n } = s;
  const { W, WET, LAKE, ELEV, DIST, COL } = v;
  const S = samplesPerTile(n);
  const w = n * S;
  const rgb = new Float32Array(w * w * 3);
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
      const shade = 1 + (-dx - dy) * k;
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

/** Tiles the roads run over: trees and hills stay off them. */
const roadTiles = (s: Scene) => {
  const tiles = new Set<string>();
  const routes = s.home ? s.roads.map((t) => marchRoute(s.home!, t)) : [];

  for (const r of routes) for (const p of r.path) tiles.add(`${p.x},${p.y}`);

  return { tiles, routes };
};

const paintFlat = (
  g: CanvasRenderingContext2D,
  s: Scene,
  v: Survey,
  routes: ReturnType<typeof marchRoute>[],
  road: Set<string>,
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

  // Fields round villages: life where people live.
  for (const vil of s.villages)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = vil.x + dx;
        const y = vil.y + dy;

        if ((!dx && !dy) || occupied.has(`${x},${y}`) || road.has(`${x},${y}`)) continue;
        if (v.at(x - ox, y - oy) !== "plains") continue;
        if (rnd(x, y, 130) > 0.55) continue;
        const gold = rnd(x, y, 132) > 0.45;

        g.save();
        g.translate(px(x), py(y));
        g.rotate((rnd(x, y, 131) - 0.5) * 0.6);
        g.fillStyle = gold ? "rgba(214,180,88,0.85)" : "rgba(122,140,60,0.9)";
        g.fillRect(-16, -12, 32, 24);
        g.strokeStyle = gold ? "rgba(160,120,40,0.7)" : "rgba(70,90,34,0.8)";
        g.lineWidth = 1.2;
        g.beginPath();
        for (let k = -9; k <= 9; k += 4.5) {
          g.moveTo(-14, k);
          g.lineTo(14, k);
        }
        g.stroke();
        g.strokeStyle = "rgba(60,44,20,0.5)";
        g.strokeRect(-16, -12, 32, 24);
        g.restore();
      }

  // Roads: the way armies actually march, so a target's road is plain to see.
  g.save();
  g.lineCap = g.lineJoin = "round";
  for (const r of routes) {
    const pts = r.path.map((p, k) => ({
      x: px(p.x) + (k && k < r.path.length - 1 ? (rnd(p.x, p.y, 61) - 0.5) * 10 : 0),
      y: py(p.y) + (k && k < r.path.length - 1 ? (rnd(p.x, p.y, 62) - 0.5) * 10 : 0),
      wet: r.wet[k],
    }));
    const curve = (atSea: boolean) => {
      const p = new Path2D();
      let open = false;

      for (let k = 0; k < pts.length - 1; k++) {
        if ((pts[k].wet || pts[k + 1].wet) !== atSea) {
          open = false;
          continue;
        }
        const a = pts[k - 1] ?? pts[k];
        const b = pts[k];
        const c = pts[k + 1];
        const d = pts[k + 2] ?? c;

        if (!open) p.moveTo(b.x, b.y);
        open = true;
        p.bezierCurveTo(
          b.x + (c.x - a.x) / 6,
          b.y + (c.y - a.y) / 6,
          c.x - (d.x - b.x) / 6,
          c.y - (d.y - b.y) / 6,
          c.x,
          c.y,
        );
      }

      return p;
    };
    const land = curve(false);

    g.setLineDash([]);
    g.strokeStyle = "rgba(48,32,16,0.45)";
    g.lineWidth = 9;
    g.stroke(land);
    g.strokeStyle = "rgba(196,164,108,0.9)";
    g.lineWidth = 5.5;
    g.stroke(land);
    g.strokeStyle = "rgba(240,220,170,0.35)";
    g.lineWidth = 1.5;
    g.setLineDash([3, 6]);
    g.stroke(land);
    // Sea lanes: a dotted wake.
    g.strokeStyle = "rgba(230,240,235,0.6)";
    g.lineWidth = 2;
    g.setLineDash([2, 7]);
    g.stroke(curve(true));
  }
  g.restore();

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

// ─── 3. Painted terrain ──────────────────────────────────────────────────────

const paintTerrain = (g: CanvasRenderingContext2D, s: Scene, v: Survey, icons: Icons, road: Set<string>) => {
  const T = TILE;
  const { ox, oy, n, occupied } = s;
  const sprites: { y: number; img: CanvasImageSource; x: number; size: number; shadow: number; a: number }[] = [];

  for (let j = -1; j <= n; j++)
    for (let i = -1; i <= n; i++) {
      const t = v.at(i, j);
      const x = ox + i;
      const y = oy + j;
      const key = `${x},${y}`;

      if (occupied.has(key)) continue;
      const onRoad = road.has(key);
      const bx = i * T;
      const by = j * T;

      if (t === "forest") {
        // Woods, not lone trees: three or four overlapping, more inside a forest.
        let many = 3;

        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (v.at(i + dx, j + dy) === "forest") many += 0.4;
        for (let k = 0; k < Math.round(many); k++) {
          const ax = bx + 6 + rnd(x, y, 70 + k) * (T - 12);
          const ay = by + 10 + rnd(x, y, 80 + k) * (T - 8);

          if (onRoad && Math.abs(ax - bx - T / 2) < 13 && Math.abs(ay - by - T / 2) < 13) continue;
          sprites.push({ y: ay, x: ax, img: icons.forest, size: 28 + rnd(x, y, 90 + k) * 12, shadow: 0.62, a: 0.32 });
        }
      } else if (t === "mountains") {
        // Ranges: two peaks per tile, big enough to overlap their neighbours.
        for (let k = 0; k < 2; k++)
          sprites.push({
            x: bx + T / 2 + (k ? 10 : -9) + (rnd(x, y, 40 + k) - 0.5) * 8,
            y: by + T * (k ? 0.98 : 0.7) + (rnd(x, y, 42 + k) - 0.5) * 6,
            img: icons.mountains,
            size: (k ? 52 : 62) + rnd(x, y, 44 + k) * 12,
            shadow: 0.8,
            a: 0.35,
          });
      } else if (t === "hills" && !onRoad) {
        sprites.push({
          x: bx + T / 2 + (rnd(x, y, 50) - 0.5) * 14,
          y: by + T * 0.85 + (rnd(x, y, 51) - 0.5) * 8,
          img: icons.hills,
          size: 26 + rnd(x, y, 52) * 8,
          shadow: 0.85,
          a: 0.22,
        });
      }
    }

  sprites.sort((p, q) => p.y - q.y);
  for (const sp of sprites) {
    g.fillStyle = `rgba(14,10,4,${sp.a})`;
    g.beginPath();
    g.ellipse(sp.x + 3, sp.y - 1, (sp.size * sp.shadow) / 2, (sp.size * sp.shadow) / 5.5, 0, 0, Math.PI * 2);
    g.fill();
    g.drawImage(sp.img, sp.x - sp.size / 2, sp.y + 3 - sp.size, sp.size, sp.size);
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
  villages = "",
  roads = "",
}: {
  ox: number;
  oy: number;
  n: number;
  /** "x,y" tiles with a tribe or camp: no trees drawn under them. */
  occupied: string;
  /** "x,y" of your tribe: your territory is drawn round it, and roads start there. */
  home?: string;
  /** "x,y;…" tribes: fields are tilled round them. */
  villages?: string;
  /** "x,y;…" places the roads from home lead to. */
  roads?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const size = n * TILE;

  useEffect(() => {
    const c = ref.current;

    if (!c || !n) return;
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.max(0.75, Math.min(dpr * 1.25, 2.5, Math.sqrt(MAX_PIXELS) / size));
    const scene: Scene = {
      ox,
      oy,
      n,
      occupied: new Set(occupied ? occupied.split(";") : []),
      home: parse(home)[0] ?? null,
      villages: parse(villages),
      roads: parse(roads),
    };
    let live = true;

    c.width = Math.round(size * scale);
    c.height = Math.round(size * scale);
    const g = c.getContext("2d");

    if (!g) return;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    const v = survey(scene);
    const { tiles, routes } = roadTiles(scene);

    // Ground first so it's never blank, then the terrain once the icons load.
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(paintSoil(scene, v), 0, 0, size, size);
    paintFlat(g, scene, v, routes, tiles);
    loadIcons()
      .then((i) => {
        if (!live) return;
        paintTerrain(g, scene, v, i, tiles);
        // Hand the finished picture over as an image: the browser tiles an
        // image and only moves the tiles when the map pans or zooms, while a
        // big canvas gets re-sent to the GPU on every frame.
        c.toBlob(
          (blob) => {
            if (!live || !blob) return;
            setSrc(URL.createObjectURL(blob));
          },
          "image/webp",
          0.9,
        );
      })
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, [ox, oy, n, size, occupied, home, villages, roads]);

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
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          aria-hidden="true"
          className="absolute left-0 top-0 max-w-none"
          decoding="async"
          draggable={false}
          src={src}
          onLoad={() => {
            setShown(src);
            // The picture is up: free the canvas's memory.
            if (ref.current) ref.current.width = ref.current.height = 0;
          }}
          style={{ width: size, height: size }}
        />
      )}
    </>
  );
});
