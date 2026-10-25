import { action } from "@/server/http";
import { upgradeTroop } from "@/lib/game/war";

/** Body: { unit: "spearman" | "archer" | "cavalry" | "ram" } — starts forging its next Arsenal upgrade. */
export const POST = action((s, { body, now }) => upgradeTroop(s, body.unit, now));
