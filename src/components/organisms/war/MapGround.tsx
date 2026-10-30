"use client";
import { memo, useEffect, useLayoutEffect, useRef } from "react";

import { PieceJob, TILE, V3, paintBlob } from "./landPaint";

import { islandTerrain } from "@/lib/game/island";
import { Point, Terrain } from "@/lib/game/map";

/**
 * The land under the war map in square pieces (see "Pieces" below), painted by
 * landPaint (in the ground worker where the browser can) and handed to the
 * camera as small pictures.
 */

export { TILE };

// ─── Pieces ──────────────────────────────────────────────────────────────────
//
// The land used to be one picture of the whole loaded area, up to 11 million
// pixels. Phones (Telegram's Android WebView above all) would not keep all of
// it decoded, and left big blank patches where the sea-blue box showed
// through. Now it's painted in small square pieces lined up on the world grid:
// only the pieces around the screen are on the page, each is cheap to decode,
// and a piece only repaints when something on it changes.

/** Tiles per side of a piece for the whole view, and for a close-up. */
export const CHUNK = 16;
export const DETAIL_CHUNK = 8;

/*
 * How sharp the pieces are (picture px per map px). Every piece on the page is
 * a decoded picture the phone has to hold in memory, and Telegram's Android
 * WebView only keeps so much: past that it drops parts of the screen, so the
 * map (and even the header over it) flashed old or blank patches. Pieces used
 * to be painted at a fixed 2x, some 150-200 MB at once. Now they're painted
 * only as sharp as the zoom needs, which keeps the land at roughly 40-60 MB:
 *
 * - the whole-view pieces (under everything, and round the screen's edge) are
 *   painted for the most zoomed-out view, where most of them are on screen;
 * - zoomed in, the pieces on screen are painted again on top, at the step
 *   that matches the zoom (see `closeUpRes`).
 */

/** Sharpness of the whole-view pieces: enough for the most zoomed-out view. */
export const baseRes = () => Math.max(0.75, Math.min(1.25, (window.devicePixelRatio || 1) * 0.5));

/** Steps for the close-up pieces, so a small zoom doesn't repaint them. */
const CLOSE_UP_STEPS = [1.25, 1.75, 2.5, 3.25, 4.2];

/**
 * Sharpness for close-up pieces at zoom `z`, or null when the whole-view
 * pieces are sharp enough. The top step keeps a piece under 1550 px a side.
 */
export const closeUpRes = (z: number) => {
  const need = z * (window.devicePixelRatio || 1);

  if (need <= baseRes() * 1.15) return null;

  return CLOSE_UP_STEPS.find((r) => r >= need * 0.9) ?? CLOSE_UP_STEPS[CLOSE_UP_STEPS.length - 1];
};

// Painting a piece takes a moment: one at a time, nearest the middle of the
// screen first. A job says when it's done (`done`): painted in the worker it
// finishes later, and the next one only starts then, so the nearest piece is
// always next.
type Job = { prio: number; run: (done: () => void) => void; dead: boolean };
const jobs: Job[] = [];
let pumping = false;

const pump = () => {
  for (let k = jobs.length - 1; k >= 0; k--) if (jobs[k].dead) jobs.splice(k, 1);
  if (!jobs.length) {
    pumping = false;

    return;
  }
  let best = 0;

  for (let k = 1; k < jobs.length; k++) if (jobs[k].prio < jobs[best].prio) best = k;
  const [job] = jobs.splice(best, 1);

  // Painted on the page, let it draw a frame in between.
  job.run(() => requestAnimationFrame(() => setTimeout(pump, 0)));
};

const enqueue = (prio: number, run: (done: () => void) => void): Job => {
  const job = { prio, run, dead: false };

  jobs.push(job);
  if (!pumping) {
    pumping = true;
    setTimeout(pump, 0);
  }

  return job;
};

// Finished pieces, kept (as small compressed files) so panning back is instant.
// A picture still on screen is never freed: a phone may drop a decoded image
// and fetch it again, and a freed one comes back blank.
type Entry = { url: string; users: number; used: number };
const pieces = new Map<string, Entry>();
const KEEP = 64;

const trim = () => {
  if (pieces.size <= KEEP) return;
  const idle = Array.from(pieces.entries())
    .filter(([, e]) => !e.users)
    .sort((a, b) => a[1].used - b[1].used);

  for (const [k, e] of idle) {
    if (pieces.size <= KEEP) break;
    URL.revokeObjectURL(e.url);
    pieces.delete(k);
  }
};
const take = (key: string) => {
  const e = pieces.get(key);

  if (e) {
    e.users++;
    e.used = Date.now();
  }

  return e;
};
const release = (key: string) => {
  const e = pieces.get(key);

  if (e) e.users = Math.max(0, e.users - 1);
  trim();
};

// Painting the land is the heaviest thing the map does: a few hundred ms a
// piece on a phone, every time a drag reaches new ground. In a worker it
// happens off the page's thread, and the drag doesn't stop for it.
let worker: Worker | null | undefined;
let asked = 0;
const waiting = new Map<number, (blob: Blob | null) => void>();

const groundWorker = () => {
  if (worker !== undefined) return worker;
  worker = null;
  try {
    if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") {
      const w = new Worker(new URL("./ground.worker.ts", import.meta.url));

      w.onmessage = (e: MessageEvent<{ id: number; blob: Blob | null }>) => {
        waiting.get(e.data.id)?.(e.data.blob);
        waiting.delete(e.data.id);
      };
      // A worker that fails stops being used; the rest is painted here.
      w.onerror = () => {
        worker = null;
        waiting.forEach((resolve) => resolve(null));
        waiting.clear();
      };
      worker = w;
    }
  } catch {
    worker = null;
  }

  return worker;
};

/** Paints a piece in the worker, or here when there isn't one (or it failed). */
const paint = (job: PieceJob): Promise<Blob | null> => {
  const w = groundWorker();

  if (!w) return paintBlob(job);
  const id = ++asked;

  return new Promise<Blob | null>((resolve) => {
    waiting.set(id, resolve);
    w.postMessage({ id, job });
  }).then((blob) => blob ?? (worker ? null : paintBlob(job)));
};

/**
 * One square piece of land, `n` tiles a side with its top-left tile at
 * (x, y). Puts nothing on the page: it hands its decoded picture to the
 * map's canvas (null when it goes).
 */
export const GroundPiece = memo(function GroundPiece({
  x,
  y,
  n,
  occupied,
  home = "",
  detail = false,
  res,
  prio = 0,
  onImage,
}: {
  x: number;
  y: number;
  n: number;
  onImage: (img: HTMLImageElement | null) => void;
  /** "x,y" tiles with a tribe or camp on or next to this piece: no trees under them. */
  occupied: string;
  /** "x,y" of your tribe when its territory reaches this piece. */
  home?: string;
  /** A close-up piece, painted at full detail over the whole-view ones. */
  detail?: boolean;
  /** Picture px per map px (see baseRes and closeUpRes). */
  res: number;
  /** Lower paints sooner. */
  prio?: number;
}) {
  const key = `${detail ? "d" : "b"}${res}|${x},${y},${n}|${occupied}|${home}`;
  const held = useRef<string | null>(null);
  const prioRef = useRef(prio);
  const onImageRef = useRef(onImage);

  prioRef.current = prio;
  onImageRef.current = onImage;

  useEffect(() => {
    let live = true;
    let job: Job | null = null;
    // Decode first, then swap: the old picture stays up until the new one can be drawn.
    const show = (k: string) => {
      const e = take(k);

      if (!e) return;
      const img = new Image();

      img.src = e.url;
      img
        .decode()
        .catch(() => undefined)
        .then(() => {
          if (!live) return release(k);
          const prev = held.current;

          held.current = k;
          onImageRef.current(img);
          if (prev) release(prev);
        });
    };

    if (pieces.has(key)) show(key);
    else {
      job = enqueue(prioRef.current, (done) => {
        paint({ x, y, n, occupied, home, detail, res }).then((blob) => {
          done();
          if (!blob) return;
          if (!pieces.has(key)) pieces.set(key, { url: URL.createObjectURL(blob), users: 0, used: Date.now() });
          if (live) show(key);
          else trim();
        });
      });
    }

    return () => {
      live = false;
      if (job) job.dead = true;
    };
  }, [key, x, y, n, occupied, home, detail, res]);

  useEffect(
    () => () => {
      if (held.current) release(held.current);
      held.current = null;
      onImageRef.current(null);
    },
    [],
  );

  return null;
});

/** Rough colours, one per tile: shown at once, under the pieces still being painted. */
export const ROUGH: Record<Terrain, V3> = {
  plains: [0x80, 0x88, 0x4c],
  forest: [0x3e, 0x58, 0x2e],
  hills: [0x8c, 0x7c, 0x55],
  mountains: [0x7a, 0x70, 0x64],
  lake: [0x3a, 0x76, 0x7c],
  sea: [0x1d, 0x48, 0x5e],
};

/**
 * The whole loaded area at one pixel per tile, stretched soft under the
 * pieces: while a piece is still being painted, the land under it shows in
 * its rough colours instead of an empty blue box. Painted on a hidden canvas
 * and handed to the map's canvas.
 */
export const GroundOverview = memo(function GroundOverview({
  ox,
  oy,
  n,
  home,
  onCanvas,
}: {
  ox: number;
  oy: number;
  n: number;
  /** Your tribe's tile: if it's at sea, its island shows here too. */
  home?: Point;
  onCanvas: (c: HTMLCanvasElement | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const onCanvasRef = useRef(onCanvas);

  onCanvasRef.current = onCanvas;
  useEffect(() => () => onCanvasRef.current(null), []);

  // Before the frame is shown: drawn after it, a new area showed the old
  // area's colours for a frame, shifted by the whole move, and the land jumped.
  useLayoutEffect(() => {
    const c = ref.current;

    if (!c || !n) return;
    c.width = c.height = n;
    const g = c.getContext("2d");

    if (!g) return;
    const img = g.createImageData(n, n);
    const ground = islandTerrain(home);

    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const [r, gr, b] = ROUGH[ground(ox + i, oy + j)];
        const p = (j * n + i) * 4;

        img.data[p] = r;
        img.data[p + 1] = gr;
        img.data[p + 2] = b;
        img.data[p + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    onCanvasRef.current(c);
  }, [ox, oy, n, home?.x, home?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={ref} aria-hidden="true" className="hidden" />;
});
