import { action } from "@/server/http";
import { trainTroops } from "@/lib/game/war";

/** Body: { unit: unit id from UNIT_IDS in config.ts, count: number } */
export const POST = action((s, { body, now }) => trainTroops(s, body.unit, Number(body.count), now));
