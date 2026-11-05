import { recallSupport } from "@/server/clanWar";
import { handler } from "@/server/http";
import { playerView } from "@/server/players";

/** Body: { id }. Calls your guards home, or sends a clanmate's guards away from your village. */
export const POST = handler(async ({ body, player, now }) => playerView(await recallSupport(player, body, now), now), { resolveBattles: true });
