import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { marchTo } from "@/server/war";

/** Body: { target?: playerId, camp?: level, units }. The battle happens when the army arrives. */
export const POST = handler(
  async ({ body, player, now }) => {
    const to = body.camp ? { camp: Number(body.camp) } : { target: Number(body.target) };
    const { player: p, march } = await marchTo(player, to, body.units, now);

    return { ...(await playerView(p, now)), march };
  },
  { resolveBattles: true }
);
