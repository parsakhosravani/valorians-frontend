/// <reference lib="webworker" />
/**
 * Paints pieces of the war map's land off the page's thread, so panning and
 * zooming never stutter while new land is painted. Gets a GroundJob, sends
 * back the finished picture as an image Blob.
 */
import { GroundJob, paintGround } from "./groundPaint";

self.onmessage = async (e: MessageEvent<{ id: number; job: GroundJob }>) => {
  const { id, job } = e.data;

  try {
    const c = paintGround(job) as OffscreenCanvas;
    const blob = await c.convertToBlob({ type: "image/webp", quality: 0.9 });

    self.postMessage({ id, blob });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
