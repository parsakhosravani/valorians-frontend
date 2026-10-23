import { action } from "@/server/http";
import { trainTroops } from "@/lib/game/war";

/** Body: { unit: "spearman" | "archer" | "cavalry" | "ram", count: number } */
export const POST = action((s, { body, now }) => trainTroops(s, body.unit, Number(body.count), now));
