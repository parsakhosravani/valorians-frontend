import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { marchTo } from "@/server/war";

/** Body: { target?: playerId, camp?: level, lair?: { x, y }, units }. The battle happens when the army arrives. */
export const POST = handler(
  async ({ body, player, now }) => {
    const to = body.lair ? { lair: { x: Number(body.lair.x), y: Number(body.lair.y) } } : body.camp ? { camp: Number(body.camp) } : { target: Number(body.target) };
    const { player: p, march } = await marchTo(player, to, body.units, now);

    return { ...(await playerView(p, now)), march };
  },
  { resolveBattles: true }
);
