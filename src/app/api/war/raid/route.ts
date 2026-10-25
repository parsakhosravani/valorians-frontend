import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { marchTo } from "@/server/war";

/** Body: { target: number (player id), units }. Sends an army; the battle happens on arrival. */
export const POST = handler(async ({ body, player, now }) => {
  const { player: p, march } = await marchTo(player, { target: Number(body.target) }, body.units, now);

  return { ...(await playerView(p, now)), march };
});
