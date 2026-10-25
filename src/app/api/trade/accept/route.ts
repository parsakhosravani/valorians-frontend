import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { acceptTrade } from "@/server/trade";

/** Body: { id }. Pays for an offer; both loads arrive after the merchants travel. */
export const POST = handler(async ({ body, player, now }) => playerView(await acceptTrade(player, Number(body.id), now), now));
