import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { marchTo } from "@/server/war";
import { joinStrike } from "@/server/clanWar";

/** Body: { target?: playerId, camp?: level, lair?: { x, y }, units, rally?: clan strike id }. The battle happens when the army arrives. */
export const POST = handler(
  async ({ body, player, now }) => {
    const to = body.lair
      ? { lair: { x: Number(body.lair.x), y: Number(body.lair.y) } }
      : body.camp
        ? { camp: Number(body.camp) }
        : { target: Number(body.target), ...(body.rally ? { rally: Number(body.rally) } : {}) };
    // Joining a clan strike far ahead: the army waits at home and sets out just in time.
    if ("rally" in to && to.rally) {
      const muster = await joinStrike(player, to.rally, to.target, body.units, now);

      if (muster) return { ...(await playerView(player, now)), muster, march: { id: 0, arrivesAt: muster.landAt } };
    }
    const { player: p, march } = await marchTo(player, to, body.units, now);

    return { ...(await playerView(p, now)), march };
  },
  { resolveBattles: true }
);
