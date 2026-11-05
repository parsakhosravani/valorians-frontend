import { handler } from "@/server/http";
import { GameError } from "@/lib/game/engine";
import { playerView } from "@/server/players";
import { marchTo } from "@/server/war";
import { joinStrike } from "@/server/clanWar";

/** Body: { target?: playerId, outpost?: their outpost index, camp?: level, lair?: { x, y }, units, rally?: clan strike id, base?: your outpost index }. The battle happens when the army arrives. */
export const POST = handler(
  async ({ body, player, now }) => {
    // `base`: sent from that outpost's garrison. `outpost`: the target tribe's garrisoned outpost.
    const base = body.base != null ? { base: Number(body.base) } : {};

    if (body.rally && body.base != null) throw new GameError("Clan strike armies set out from home", "rally_home");
    const to = body.lair
      ? { lair: { x: Number(body.lair.x), y: Number(body.lair.y) }, ...base }
      : body.camp
        ? { camp: Number(body.camp), ...base }
        : {
            target: Number(body.target),
            ...(body.rally ? { rally: Number(body.rally) } : {}),
            ...(body.outpost != null ? { outpost: Number(body.outpost) } : {}),
            ...base,
          };
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
