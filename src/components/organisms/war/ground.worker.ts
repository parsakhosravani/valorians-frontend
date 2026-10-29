/**
 * Paints pieces of the war map's land off the page's thread (see paintBlob
 * in landPaint): MapGround asks for a piece, the worker answers with its
 * picture, and dragging the map never waits for the painting.
 */
import { PieceJob, paintBlob } from "./landPaint";

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: number; job: PieceJob }>) => void) | null;
  postMessage: (msg: { id: number; blob: Blob | null }) => void;
};

ctx.onmessage = async (e) => {
  const { id, job } = e.data;
  let blob: Blob | null = null;

  try {
    blob = await paintBlob(job);
  } catch {
    // The page paints it itself instead.
  }
  ctx.postMessage({ id, blob });
};
