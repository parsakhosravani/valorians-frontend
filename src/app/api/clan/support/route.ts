import { sendSupport } from "@/server/clanWar";
import { handler } from "@/server/http";
import { playerView } from "@/server/players";

/** Body: { to: clanmate's player id, units }. Sends troops to guard their village. */
export const POST = handler(
  async ({ body, player, now }) => {
    const { player: p, support } = await sendSupport(player, body, now);

    return { ...(await playerView(p, now)), support };
  },
  { resolveBattles: true }
);
