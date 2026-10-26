import { action } from "@/server/http";

import { startPlusTrial } from "@/lib/game/engine";

export const dynamic = "force-dynamic";

/** Starts the player's one free Valorians Plus trial. */
export const POST = action((s, { now }) => startPlusTrial(s, now));
