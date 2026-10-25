import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { scoutTribe } from "@/server/war";

/** Body: { target: playerId }. Costs coins; needs an Exploration Center. */
export const POST = handler(async ({ body, player, now }) => {
  const { player: p, scout } = await scoutTribe(player, Number(body.target), now);

  return { ...(await playerView(p, now)), scout };
});
