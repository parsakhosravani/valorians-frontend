import { action } from "@/server/http";
import { startQuest } from "@/lib/game/engine";

/** Body: { quest: "telegram" | "youtube" | "x" } — call when the player opens the link. */
export const POST = action((s, { body, now }) => startQuest(s, body.quest, now));
