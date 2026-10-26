import { action } from "@/server/http";
import { cancelTraining } from "@/lib/game/war";

/** Body: { startsAt: number } — the batch's startsAt, as shown in state.training. */
export const POST = action((s, { body, now }) => cancelTraining(s, Number(body.startsAt), now));
