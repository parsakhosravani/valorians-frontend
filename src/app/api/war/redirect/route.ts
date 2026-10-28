import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { redirectMarch } from "@/server/war";

/**
 * Body: { attack?: attackId, march?: marchId, target?: playerId, camp?: level, lair?: { x, y }, units }.
 * Gives an army on the road (outbound `attack`, or homeward `march`) a new target.
 */
export const POST = handler(
  async ({ body, player, now }) => {
    const from = body.march != null ? { march: String(body.march) } : { attack: Number(body.attack) };
    const to = body.lair ? { lair: { x: Number(body.lair.x), y: Number(body.lair.y) } } : body.camp ? { camp: Number(body.camp) } : { target: Number(body.target) };
    const { player: p, march } = await redirectMarch(player, from, to, body.units, now);

    return { ...(await playerView(p, now)), march };
  },
  { resolveBattles: true }
);
