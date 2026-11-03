import { action } from "@/server/http";
import { finishBuilding } from "@/lib/game/engine";

/** Body: { building }. Finishes its job at once when only a few minutes are left (more with Plus). */
export const POST = action((s, { body, now }) => finishBuilding(s, String(body.building), now));
