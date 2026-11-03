import { action } from "@/server/http";
import { cancelBuilding } from "@/lib/game/engine";

/** Body: { building }. Cancels the job on it: a full refund in the first minute, 80% after. */
export const POST = action((s, { body, now }) => cancelBuilding(s, String(body.building), now));
