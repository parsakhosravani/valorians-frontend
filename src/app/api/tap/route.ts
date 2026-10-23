import { action } from "@/server/http";
import { applyTaps } from "@/lib/game/engine";

/**
 * Body: { resource: "iron" | "wood" | "clay" | "crop", taps, crits?, comboSum?, frenzyTaps? }
 * Everything the client claims is capped by the engine.
 */
export const POST = action((s, { body, now }) =>
  applyTaps(
    s,
    body.resource,
    { taps: body.taps, crits: body.crits, comboSum: body.comboSum, frenzyTaps: body.frenzyTaps },
    now
  ).state
);
