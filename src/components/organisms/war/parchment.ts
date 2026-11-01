/**
 * The whole world as an old parchment map, for the war map zoomed far out:
 * warm stained paper, seas and lakes washed in pale ink with the coast drawn
 * in a firm line and a ripple line out to sea, mountains drawn as little
 * shaded peaks, hills as humps, forests as clumps of trees, waves dotted
 * over open water, and a double ink border round the edge of the world.
 *
 * Painted once (a moment's work) into one picture, PX_PER_TILE pixels a
 * tile, then drawn under the markers like the land. Plain canvas code: the
 * caller passes how to make a canvas and what stands on each tile, so it can
 * be previewed off the page.
 */

import type { Terrain } from "@/lib/game/map";

type Ctx = CanvasRenderingContext2D;
type Canvas = CanvasImageSource & { width: number; height: number };
export type MakeCanvas = (w: number, h: number) => { canvas: Canvas; g: Ctx };

/** Pixels of the picture per world tile. */
export const PX_PER_TILE = 4;

const INK = "#4A3520";
const PAPER: [number, number, number] = [233, 215, 172];
const WATER: [number, number, number] = [158, 186, 176];

/** A repeatable random number for a spot (the map looks the same every time). */
const rnd = (x: number, y: number, k = 0) => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;

  h = Math.imul(h ^ (h >>> 13), 1274126177);

  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Blurs a grid of numbers in place (three box passes ≈ a soft gaussian). */
function blur(a: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(a.length);

  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      const row = y * w;

      for (let x = -r; x <= r; x++) sum += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = sum / (2 * r + 1);
        sum += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;

      for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum / (2 * r + 1);
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
}

export function paintParchment(size: number, terrain: (i: number, j: number) => Terrain, make: MakeCanvas): Canvas {
  const P = PX_PER_TILE;
  const W = size * P;
  const { canvas, g } = make(W, W);
  const wet = (t: Terrain) => t === "sea" || t === "lake";
  const tiles: Terrain[] = new Array(size * size);

  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) tiles[j * size + i] = terrain(i, j);

  // Land (1) and water (0), at picture size and softened, so coasts curve.
  const land = new Float32Array(W * W);

  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) land[y * W + x] = wet(tiles[Math.floor(y / P) * size + Math.floor(x / P)]) ? 0 : 1;
  blur(land, W, W, Math.max(1, Math.round(P * 0.6)));
  // Further out: for the ripple line round the coast.
  const far = Float32Array.from(land);

  blur(far, W, W, P * 2);

  // Paper and wash, pixel by pixel: grain in the paper, the water a shade
  // deeper away from the coast, the coast itself a firm ink line and a
  // fainter ripple line a little way out.
  const img = g.createImageData(W, W);
  const d = img.data;

  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const m = land[k];
      const grain = (rnd(x, y) - 0.5) * 14 + (rnd(x >> 3, y >> 3, 1) - 0.5) * 10;
      const deep = Math.max(0, 0.5 - far[k]) * 0.35;
      let [r, gr, b] = m >= 0.5 ? PAPER : WATER.map((c, n) => c - deep * (n === 2 ? 40 : 70)) as [number, number, number];
      // The coast: where land meets water.
      const coast = 1 - Math.min(1, Math.abs(m - 0.5) * 7);
      // The ripple: a thin line out at sea, following the coast.
      const ripple = m < 0.5 ? 1 - Math.min(1, Math.abs(far[k] - 0.16) * 30) : 0;
      const ink = Math.max(coast * 0.9, ripple * 0.35);

      r = r + grain;
      gr = gr + grain;
      b = b + grain * 0.8;
      d[k * 4] = r + (74 - r) * ink;
      d[k * 4 + 1] = gr + (53 - gr) * ink;
      d[k * 4 + 2] = b + (32 - b) * ink;
      d[k * 4 + 3] = 255;
    }
  g.putImageData(img, 0, 0);

  // Age: soft brown stains here and there.
  for (let n = 0; n < 70; n++) {
    const x = rnd(n, 7, 3) * W;
    const y = rnd(n, 11, 5) * W;
    const r = (0.02 + rnd(n, 13, 7) * 0.07) * W;
    const stain = g.createRadialGradient(x, y, 0, x, y, r);

    stain.addColorStop(0, "rgba(120,80,30,0.10)");
    stain.addColorStop(1, "rgba(120,80,30,0)");
    g.fillStyle = stain;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineCap = "round";
  g.lineJoin = "round";
  const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < size && j < size ? tiles[j * size + i] : "sea");

  // Drawn on a loose grid, a little jittered, so the symbols don't line up.
  const scatter = (step: number, k: number, draw: (x: number, y: number, s: number, t: Terrain) => void) => {
    for (let j = 0; j < size; j += step)
      for (let i = 0; i < size; i += step) {
        const ti = Math.min(size - 1, i + Math.floor(rnd(i, j, k) * step));
        const tj = Math.min(size - 1, j + Math.floor(rnd(i, j, k + 1) * step));

        draw((ti + 0.5) * P, (tj + 0.5) * P, rnd(i, j, k + 2), at(ti, tj));
      }
  };

  // Waves on open water: little ink ticks, away from the coast.
  g.lineWidth = Math.max(0.7, P * 0.18);
  g.globalAlpha = 0.45;
  scatter(9, 20, (x, y, r, t) => {
    if (t !== "sea" || far[Math.round(y) * W + Math.round(x)] > 0.02) return;
    const w = P * 1.6;

    g.beginPath();
    g.moveTo(x - w, y);
    g.quadraticCurveTo(x - w / 2, y - w * 0.5, x, y);
    g.quadraticCurveTo(x + w / 2, y + w * 0.5 * (r > 0.5 ? 1 : -1), x + w, y);
    g.stroke();
  });
  g.globalAlpha = 1;

  // Forests: clumps of little round trees on trunks.
  scatter(2, 30, (x, y, r, t) => {
    if (t !== "forest") return;
    const s = P * (0.9 + r * 0.5);

    g.globalAlpha = 0.85;
    g.fillStyle = "#5E6B3A";
    g.beginPath();
    g.arc(x, y - s * 0.4, s * 0.55, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = Math.max(0.6, P * 0.14);
    g.stroke();
    g.beginPath();
    g.moveTo(x, y + s * 0.15);
    g.lineTo(x, y + s * 0.55);
    g.stroke();
    g.globalAlpha = 1;
  });

  // Hills: low humps.
  scatter(3, 40, (x, y, r, t) => {
    if (t !== "hills") return;
    const w = P * (1.4 + r * 0.6);

    g.lineWidth = Math.max(0.7, P * 0.16);
    g.strokeStyle = INK;
    g.globalAlpha = 0.75;
    g.beginPath();
    g.moveTo(x - w, y + w * 0.2);
    g.quadraticCurveTo(x, y - w * 0.8, x + w, y + w * 0.2);
    g.stroke();
    g.globalAlpha = 1;
  });

  // Mountains: shaded peaks, the sunny side light, the far side hatched.
  scatter(2, 50, (x, y, r, t) => {
    if (t !== "mountains") return;
    const w = P * (1.3 + r * 0.8);
    const h = w * (1.2 + r * 0.4);

    g.globalAlpha = 0.95;
    g.fillStyle = "rgba(120,96,70,0.55)";
    g.beginPath();
    g.moveTo(x, y - h);
    g.lineTo(x + w, y + w * 0.3);
    g.lineTo(x + w * 0.05, y + w * 0.3);
    g.closePath();
    g.fill();
    g.lineWidth = Math.max(0.7, P * 0.18);
    g.strokeStyle = INK;
    g.beginPath();
    g.moveTo(x - w, y + w * 0.3);
    g.lineTo(x, y - h);
    g.lineTo(x + w, y + w * 0.3);
    g.stroke();
    g.globalAlpha = 1;
  });

  // A faint grid every 50 tiles, as old maps have.
  g.strokeStyle = "rgba(74,53,32,0.12)";
  g.lineWidth = Math.max(1, P * 0.25);
  for (let k = 50; k < size; k += 50) {
    g.beginPath();
    g.moveTo(k * P, 0);
    g.lineTo(k * P, W);
    g.moveTo(0, k * P);
    g.lineTo(W, k * P);
    g.stroke();
  }

  // Burnt, darker edges and a double ink border round the world.
  const edge = g.createRadialGradient(W / 2, W / 2, W * 0.3, W / 2, W / 2, W * 0.75);

  edge.addColorStop(0, "rgba(90,55,20,0)");
  edge.addColorStop(1, "rgba(90,55,20,0.35)");
  g.fillStyle = edge;
  g.fillRect(0, 0, W, W);
  g.strokeStyle = INK;
  g.lineWidth = P * 1.2;
  g.strokeRect(P * 2, P * 2, W - P * 4, W - P * 4);
  g.lineWidth = P * 0.4;
  g.strokeRect(P * 4, P * 4, W - P * 8, W - P * 8);

  return canvas;
}
