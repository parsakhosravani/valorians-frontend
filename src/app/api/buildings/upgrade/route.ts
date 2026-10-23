import { action } from "@/server/http";
import { upgradeBuilding } from "@/lib/game/engine";

/** Body: { building: string } — a building id from BUILDINGS. */
export const POST = action((s, { body, now }) => upgradeBuilding(s, String(body.building), now));
