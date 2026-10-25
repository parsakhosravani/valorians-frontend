import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { postTrade } from "@/server/trade";

/** Body: { give, giveAmount, want, wantAmount }. Locks the goods until the offer is taken or cancelled. */
export const POST = handler(async ({ body, player, now }) => playerView(await postTrade(player, body, now), now));
