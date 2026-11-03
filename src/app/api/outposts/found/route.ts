import { handler } from "@/server/http";
import { settleOutpost } from "@/server/outposts";
import { playerView } from "@/server/players";

/** Founds the tribe's next outpost on the nearest free land. */
export const POST = handler(async ({ player, now }) => playerView(await settleOutpost(player, now), now));
