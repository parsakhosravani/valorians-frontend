/**
 * Paints the parchment world map (see paintParchment) off the page's
 * thread: a second or two of work that would otherwise freeze the map.
 * Answers with the picture as an ImageBitmap, handed over without copying.
 */
import { paintParchment } from "./parchment";

import { MAP_MIN, MAP_SIZE } from "@/lib/game/config";
import { terrainAt } from "@/lib/game/map";

const ctx = self as unknown as {
  onmessage: (() => void) | null;
  postMessage: (msg: ImageBitmap | null, transfer?: Transferable[]) => void;
};

ctx.onmessage = () => {
  try {
    const c = paintParchment(MAP_SIZE, (i, j) => terrainAt(MAP_MIN + i, MAP_MIN + j), (w, h) => {
      const canvas = new OffscreenCanvas(w, h);

      return { canvas, g: canvas.getContext("2d") as unknown as CanvasRenderingContext2D };
    }) as OffscreenCanvas;
    const bitmap = c.transferToImageBitmap();

    ctx.postMessage(bitmap, [bitmap]);
  } catch {
    ctx.postMessage(null);
  }
};
