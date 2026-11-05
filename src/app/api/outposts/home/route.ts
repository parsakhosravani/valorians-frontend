import { handler } from "@/server/http";
import { bringHome } from "@/server/outposts";
import { playerView } from "@/server/players";

/** Body: { outpost: index, units }. Troops of the outpost's garrison march home. */
export const POST = handler(async ({ player, now, body }) => playerView(await bringHome(player, Number(body?.outpost), body?.units, now), now));
