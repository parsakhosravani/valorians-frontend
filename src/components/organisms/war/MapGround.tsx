"use client";
import { memo, useEffect, useRef, useState } from "react";

import { GroundJob, MAX_PIXELS, TILE, paintGround } from "./groundPaint";

export { TILE };

// ─── Painting off the page's thread ──────────────────────────────────────────

type Done = (blob: Blob | null) => void;
let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, Done>();

/** One shared painter worker, or null where the browser can't (no OffscreenCanvas). */
const painter = () => {
  if (worker !== undefined) return worker;
  try {
    if (typeof OffscreenCanvas === "undefined" || typeof Worker === "undefined") throw new Error("no worker painting");
    const w = new Worker(new URL("./ground.worker.ts", import.meta.url), { type: "module" });

    w.onmessage = (e: MessageEvent<{ id: number; blob?: Blob; error?: string }>) => {
      const done = waiting.get(e.data.id);

      waiting.delete(e.data.id);
      done?.(e.data.blob ?? null);
    };
    w.onerror = () => {
      // The worker can't run here: paint on the page from now on.
      worker = null;
      waiting.forEach((done) => done(null));
      waiting.clear();
    };
    worker = w;
  } catch {
    worker = null;
  }

  return worker;
};

/** Paints the job in the worker, falling back to the page; resolves with the picture. */
const paint = (job: GroundJob): Promise<Blob | null> =>
  new Promise((resolve) => {
    const onPage = () =>
      // Give the browser a frame first so the tap or pan that asked for this finishes drawing.
      setTimeout(() => {
        const c = paintGround(job);

        if (c instanceof HTMLCanvasElement) c.toBlob(resolve, "image/webp", 0.9);
        else (c as OffscreenCanvas).convertToBlob({ type: "image/webp", quality: 0.9 }).then(resolve, () => resolve(null));
      }, 16);
    const w = painter();

    if (!w) return onPage();
    const id = nextId++;

    waiting.set(id, (blob) => (blob ? resolve(blob) : onPage()));
    w.postMessage({ id, job });
  });

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
  // The finished picture and the piece of world it shows: while the next one
  // paints (after the map moves), the last one stays where its land is.
  const [pic, setPic] = useState<{ url: string; ox: number; oy: number; size: number } | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const size = n * TILE;

  useEffect(() => {
    if (!n) return;
    const dpr = window.devicePixelRatio || 1;
    const scale = detail
      ? Math.min(dpr * 2.2, Math.sqrt(MAX_PIXELS / 3) / size)
      : Math.max(0.75, Math.min(dpr * 1.25, 2.5, Math.sqrt(MAX_PIXELS) / size));
    let live = true;

    paint({ ox, oy, n, occupied, home, detail, scale }).then(async (blob) => {
      if (!live || !blob) return;
      const url = URL.createObjectURL(blob);
      // Decode before swapping, so the old picture never blinks out or slides.
      const img = new window.Image();

      img.src = url;
      await img.decode().catch(() => undefined);
      if (live) setPic({ url, ox, oy, size });
      else URL.revokeObjectURL(url);
    });

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

  return pic ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      aria-hidden="true"
      className="absolute max-w-none"
      decoding="async"
      draggable={false}
      src={pic.url}
      onLoad={() => setShown(pic.url)}
      style={{ left: (pic.ox - ox) * TILE, top: (pic.oy - oy) * TILE, width: pic.size, height: pic.size }}
    />
  ) : null;
});
