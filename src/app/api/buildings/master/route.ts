import { action } from "@/server/http";
import { masterBuilding } from "@/lib/game/engine";

/** Body: { building }. Starts its next Mastery star (it must be at its top level). */
export const POST = action((s, { body, now }) => masterBuilding(s, String(body.building), now));
