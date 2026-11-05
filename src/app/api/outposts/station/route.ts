import { handler } from "@/server/http";
import { stationTroops } from "@/server/outposts";
import { playerView } from "@/server/players";

/** Body: { outpost: index, units }. Troops march from the village to the outpost's garrison. */
export const POST = handler(async ({ player, now, body }) => playerView(await stationTroops(player, Number(body?.outpost), body?.units, now), now));
