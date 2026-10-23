import { action } from "@/server/http";
import { upgradeSkill } from "@/lib/game/engine";

/** Body: { skill: "tap" | "energy" } */
export const POST = action((s, { body }) => upgradeSkill(s, body.skill));
