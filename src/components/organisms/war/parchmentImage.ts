/**
 * Gets the parchment world painted (see paintParchment), once a session.
 *
 * Kept apart from parchment.ts on purpose: the worker imports parchment.ts,
 * and if that file also started the worker, the bundler would follow
 * worker → parchment.ts → worker… without end (the production build hung).
 */
import { paintParchment } from "./parchment";

import type { Terrain } from "@/lib/game/map";

let loading: Promise<CanvasImageSource | null> | null = null;

/**
 * The parchment world, painted once a session: in a worker where there is
 * one, else here when the page is idle. Resolves to null if it can't be had.
 */
export function parchmentImage(size: number, terrain: (i: number, j: number) => Terrain): Promise<CanvasImageSource | null> {
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const here = () => {
      const run = () => {
        try {
          resolve(
            paintParchment(size, terrain, (w, h) => {
              const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });

              return { canvas, g: canvas.getContext("2d")! };
            }),
          );
        } catch {
          resolve(null);
        }
      };
      const idle = (window as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback;

      if (idle) idle(run);
      else setTimeout(run, 50);
    };

    try {
      if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return here();
      const w = new Worker(new URL("./parchment.worker.ts", import.meta.url));

      w.onmessage = (e: MessageEvent<ImageBitmap | null>) => {
        w.terminate();
        if (e.data) resolve(e.data);
        else here();
      };
      w.onerror = () => {
        w.terminate();
        here();
      };
      w.postMessage(null);
    } catch {
      here();
    }
  });

  return loading;
}
