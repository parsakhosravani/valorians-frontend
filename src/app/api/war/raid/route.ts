import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { raidPlayer } from "@/server/war";

/** Body: { target: number (player id), units: { spearman, archer, cavalry, ram } } */
export const POST = handler(async ({ body, player, now }) => {
  const { player: p, report } = await raidPlayer(player, Number(body.target), body.units, now);

  return { ...(await playerView(p, now)), report };
});
