import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { marchTo } from "@/server/war";

/** Body: { level: number, units }. Sends an army to one of your barbarian camps. */
export const POST = handler(async ({ body, player, now }) => {
  const { player: p, march } = await marchTo(player, { camp: Number(body.level) }, body.units, now);

  return { ...(await playerView(p, now)), march };
});
