import { donate } from "@/server/clans";
import { handler } from "@/server/http";
import { playerView } from "@/server/players";

/** Body: { key, amount }. Gives resources or coins to the clan treasury. */
export const POST = handler(async ({ body, player, now }) => playerView(await donate(player, body, now), now));
