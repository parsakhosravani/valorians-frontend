import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { cancelTrade } from "@/server/trade";

/** Body: { id }. Takes your open offer off the market and returns the goods. */
export const POST = handler(async ({ body, player, now }) => playerView(await cancelTrade(player, Number(body.id), now), now));
