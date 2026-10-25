import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { recallMarch } from "@/server/war";

/** Body: { id: marchId }. Turns an army round before it arrives. */
export const POST = handler(
  async ({ body, player, now }) => playerView(await recallMarch(player, Number(body.id), now), now),
  { resolveBattles: true }
);
