import { action } from "@/server/http";
import { applyTaps } from "@/lib/game/engine";

/** Body: { resource: "iron" | "wood" | "clay" | "crop", taps: number } */
export const POST = action((s, { body, now }) => applyTaps(s, body.resource, Number(body.taps) || 0, now).state);
