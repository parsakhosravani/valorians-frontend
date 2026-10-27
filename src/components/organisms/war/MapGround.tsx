"use client";
import { memo, useEffect, useRef, useState } from "react";
import clsx from "clsx";

import { Terrain, terrainAt } from "@/lib/game/map";

/**
 * The land under the war map, painted once onto a canvas: soft blended
 * ground with beaches along the sea, and the painted terrain icons standing
 * on it (forests, hills, darker mountains, wheat on the plains). A canvas is
 * one picture the camera can scale for free; the old SVG redrew thousands of
 * tiles on every zoom step.
 */

export const TILE = 46; // tile size in px at zoom 1

// The sea and lakes keep their colors from before.
const FILL: Record<Terrain, [number, number, number][]> = {
  plains: [[0x5e, 0x6b, 0x37], [0x62, 0x70, 0x39], [0x5a, 0x67, 0x34]],
  forest: [[0x34, 0x49, 0x2a], [0x36, 0x50, 0x2b], [0x31, 0x45, 0x27]],
  hills: [[0x7b, 0x68, 0x48], [0x81, 0x70, 0x4e], [0x76, 0x63, 0x3f]],
  mountains: [[0x4e, 0x41, 0x30], [0x53, 0x46, 0x33], [0x4a, 0x3d, 0x2c]],
  lake: [[0x2f, 0x56, 0x64], [0x31, 0x5a, 0x69], [0x2d, 0x52, 0x60]],
  sea: [[0x1e, 0x42, 0x58], [0x20, 0x46, 0x5d], [0x1c, 0x3f, 0x54]],
};
const SAND: [number, number, number] = [0xb5, 0x9c, 0x66];
const SHALLOW: [number, number, number] = [0x2b, 0x5e, 0x74];

const wet = (t: Terrain) => t === "sea" || t === "lake";

/** Deterministic 0..1 per tile, so the map looks the same on every visit. */
const rnd = (x: number, y: number, k: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453;

  return s - Math.floor(s);
};

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

// ─── Icons ───────────────────────────────────────────────────────────────────

type Icons = {
  forest: CanvasImageSource;
  hills: CanvasImageSource;
  mountains: CanvasImageSource;
  plains: CanvasImageSource;
};

const load = (src: string) =>
  new Promise<HTMLImageElement>((ok, fail) => {
    const img = new window.Image();

    img.decoding = "async";
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = src;
  });

/** The hill icon, darkened: mountains are the same rock, taller and in shadow. */
const darken = (img: HTMLImageElement, amount: number) => {
  const c = document.createElement("canvas");

  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d")!;

  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = `rgba(22, 16, 10, ${amount})`;
  g.fillRect(0, 0, c.width, c.height);

  return c;
};

let icons: Promise<Icons> | null = null;
const loadIcons = () =>
  (icons ??= Promise.all([
    load("/images/icons/forest.webp"),
    load("/images/icons/mountain.webp"),
    load("/images/icons/plains.webp"),
  ])
    .then(([forest, hill, plains]) => ({ forest, hills: hill, mountains: darken(hill, 0.5), plains }))
    .catch((e) => {
      icons = null;
      throw e;
    }));

// ─── Painting ────────────────────────────────────────────────────────────────

const SUB = 4; // color samples per tile side, blurred into soft edges

/** Ground colors, a few samples per tile, softened so the land blends. */
const colorField = (ox: number, oy: number, n: number, ter: Terrain[][]) => {
  const w = n * SUB;
  const px = new Float32Array(w * w * 3);
  const at = (i: number, j: number) => ter[j + 1]?.[i + 1] ?? terrainAt(ox + i, oy + j);

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const t = at(i, j);
      const x = ox + i;
      const y = oy + j;
      let c: number[] = FILL[t][(((x * 7 + y * 13) % 3) + 3) % 3];
      let near = false;

      for (let dy = -1; dy <= 1 && !near; dy++)
        for (let dx = -1; dx <= 1 && !near; dx++) {
          const o = at(i + dx, j + dy);

          near = t === "sea" ? !wet(o) : t !== "lake" && o === "sea";
        }
      // Beaches where the land meets the sea, shallows on the other side.
      if (near) c = mix(c, t === "sea" ? SHALLOW : SAND, t === "sea" ? 0.45 : 0.5);
      for (let b = 0; b < SUB; b++)
        for (let a = 0; a < SUB; a++) {
          const k = ((j * SUB + b) * w + i * SUB + a) * 3;
          const shade = 1 + (rnd(x * SUB + a, y * SUB + b, 1) - 0.5) * 0.08;

          px[k] = c[0] * shade;
          px[k + 1] = c[1] * shade;
          px[k + 2] = c[2] * shade;
        }
    }
  }

  // Two small box-blur passes each way: land blends, coastlines stay clear.
  const tmp = new Float32Array(px.length);
  const r = 1;
  const pass = (src: Float32Array, dst: Float32Array, horizontal: boolean) => {
    for (let q = 0; q < w; q++)
      for (let p = 0; p < w; p++)
        for (let ch = 0; ch < 3; ch++) {
          let s = 0;
          let cnt = 0;

          for (let d = -r; d <= r; d++) {
            const u = p + d;

            if (u < 0 || u >= w) continue;
            s += src[((horizontal ? q * w + u : u * w + q) * 3) + ch];
            cnt++;
          }
          dst[((horizontal ? q * w + p : p * w + q) * 3) + ch] = s / cnt;
        }
  };

  for (let k = 0; k < 2; k++) {
    pass(px, tmp, true);
    pass(tmp, px, false);
  }

  const c = document.createElement("canvas");

  c.width = c.height = w;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, w);

  for (let k = 0, o = 0; k < px.length; k += 3, o += 4) {
    img.data[o] = px[k];
    img.data[o + 1] = px[k + 1];
    img.data[o + 2] = px[k + 2];
    img.data[o + 3] = 255;
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
    img.data[k + 3] = rnd(k, 7, 9) * 36;
  }
  g.putImageData(img, 0, 0);

  return (grain = c);
};

const paintGround = (
  g: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  n: number,
  icons: Icons | null,
  occupied: Set<string>,
) => {
  const T = TILE;
  const size = n * T;
  // Terrain with a one-tile margin, for neighbours.
  const ter: Terrain[][] = [];

  for (let j = -1; j <= n; j++) {
    const row: Terrain[] = [];

    for (let i = -1; i <= n; i++) row.push(terrainAt(ox + i, oy + j));
    ter.push(row);
  }
  const at = (i: number, j: number) => ter[j + 1][i + 1];

  // 1. Soft ground.
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(colorField(ox, oy, n, ter), 0, 0, size, size);

  // 2. Light and shade in big soft patches, then grain.
  for (let j = 0; j < n; j += 2)
    for (let i = 0; i < n; i += 2) {
      const x = ox + i;
      const y = oy + j;
      const r = T * (1.6 + rnd(x, y, 21) * 1.6);
      const cx = (i + rnd(x, y, 22) * 2) * T;
      const cy = (j + rnd(x, y, 23) * 2) * T;
      const light = rnd(x, y, 24) > 0.5;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);

      grad.addColorStop(0, light ? "rgba(255,236,190,0.07)" : "rgba(10,8,4,0.12)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  g.save();
  g.globalCompositeOperation = "soft-light";
  g.fillStyle = g.createPattern(grainTile(), "repeat")!;
  g.fillRect(0, 0, size, size);
  g.restore();

  // 3. Water: ripples on lakes, waves on the open sea (as before).
  g.lineCap = "round";
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const t = at(i, j);
      const x = ox + i;
      const y = oy + j;
      const v = (((x * 7 + y * 13) % 3) + 3) % 3;
      const px = i * T;
      const py = j * T;

      if (t === "lake") {
        g.strokeStyle = "rgba(191,224,232,0.45)";
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(px + 8, py + 20);
        g.quadraticCurveTo(px + 13, py + 16, px + 18, py + 20);
        g.quadraticCurveTo(px + 23, py + 24, px + 28, py + 20);
        g.moveTo(px + 16, py + 30);
        g.quadraticCurveTo(px + 21, py + 26, px + 26, py + 30);
        g.quadraticCurveTo(px + 31, py + 34, px + 36, py + 30);
        g.stroke();
      } else if (t === "sea" && v === 0) {
        g.strokeStyle = "rgba(159,208,230,0.35)";
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(px + 6, py + 16);
        g.quadraticCurveTo(px + 12, py + 11, px + 18, py + 16);
        g.quadraticCurveTo(px + 24, py + 21, px + 30, py + 16);
        g.moveTo(px + 18, py + 32);
        g.quadraticCurveTo(px + 24, py + 27, px + 30, py + 32);
        g.quadraticCurveTo(px + 36, py + 37, px + 42, py + 32);
        g.stroke();
      }
    }

  // 4. A whisper of grid, so distances still read.
  g.strokeStyle = "rgba(0,0,0,0.07)";
  g.lineWidth = 1;
  g.beginPath();
  for (let k = 0; k <= n; k++) {
    g.moveTo(k * T, 0);
    g.lineTo(k * T, size);
    g.moveTo(0, k * T);
    g.lineTo(size, k * T);
  }
  g.stroke();

  if (!icons) return;

  // 5. Painted terrain, back row first so nearer things overlap farther ones.
  const shadow = (cx: number, cy: number, w: number) => {
    g.fillStyle = "rgba(12,8,4,0.28)";
    g.beginPath();
    g.ellipse(cx, cy, w / 2, w / 6, 0, 0, Math.PI * 2);
    g.fill();
  };
  const icon = (img: CanvasImageSource, cx: number, bottom: number, s: number, alpha = 1) => {
    g.globalAlpha = alpha;
    g.drawImage(img, cx - s / 2, bottom - s, s, s);
    g.globalAlpha = 1;
  };

  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const t = at(i, j);
      const x = ox + i;
      const y = oy + j;

      if (occupied.has(`${x},${y}`)) continue;
      const jx = (rnd(x, y, 31) - 0.5) * 10;
      const jy = (rnd(x, y, 32) - 0.5) * 6;
      const cx = i * T + T / 2 + jx;
      const base = j * T + T * 0.82 + jy;

      if (t === "forest") {
        const s = 38 + rnd(x, y, 33) * 10;

        shadow(cx, base - 2, s * 0.7);
        icon(icons.forest, cx, base, s);
      } else if (t === "hills" && rnd(x, y, 38) < 0.5) {
        // Every other hill tile: rolling country, not a wall of peaks.
        const s = 24 + rnd(x, y, 34) * 6;

        shadow(cx, base - 2, s * 0.8);
        icon(icons.hills, cx, base, s);
      } else if (t === "mountains") {
        const s = 46 + rnd(x, y, 35) * 10;

        shadow(cx, base - 2, s * 0.85);
        icon(icons.mountains, cx, base + 2, s);
      } else if (t === "plains" && rnd(x, y, 36) < 0.16) {
        icon(icons.plains, cx, base, 20 + rnd(x, y, 37) * 4, 0.85);
      }
    }
};

/** Pixels the ground canvas may use: big enough to stay crisp, small enough for phones. */
const MAX_PIXELS = 11_000_000;

export const MapGround = memo(function MapGround({
  ox,
  oy,
  n,
  occupied,
}: {
  ox: number;
  oy: number;
  n: number;
  /** "x,y" tiles with a tribe or camp: no trees drawn under them. */
  occupied: string;
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
    const taken = new Set(occupied ? occupied.split(";") : []);
    let live = true;

    c.width = Math.round(size * scale);
    c.height = Math.round(size * scale);
    const g = c.getContext("2d");

    if (!g) return;
    const paint = (i: Icons | null) => {
      if (!live) return;
      g.setTransform(scale, 0, 0, scale, 0, 0);
      paintGround(g, ox, oy, n, i, taken);
    };

    // Ground first so it's never blank, then again with the icons once loaded.
    paint(null);
    loadIcons()
      .then((i) => {
        paint(i);
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
  }, [ox, oy, n, size, occupied]);

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
