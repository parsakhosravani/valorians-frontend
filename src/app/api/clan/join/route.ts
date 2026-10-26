import { joinClan } from "@/server/clans";
import { handler } from "@/server/http";
import { playerView } from "@/server/players";

/** Body: { id }. Joins that clan if it has room. */
export const POST = handler(async ({ body, player, now }) => playerView(await joinClan(player, body, now), now));
