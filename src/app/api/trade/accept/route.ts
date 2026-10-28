import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { acceptTrade } from "@/server/trade";

/** Body: { id, guard? }. Pays for an offer (and guards for your load, with `guard`); both loads arrive after the merchants travel. */
export const POST = handler(async ({ body, player, now }) =>
  playerView(await acceptTrade(player, Number(body.id), now, body.guard === true), now)
);
