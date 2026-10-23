import { action } from "@/server/http";
import { claimStreak } from "@/lib/game/engine";

/** Claims today's login-streak reward. */
export const POST = action((s, { now }) => claimStreak(s, now));
