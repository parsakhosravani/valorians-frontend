import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { attackCamp } from "@/server/war";

/** Body: { level: number, units: { spearman, archer, cavalry, ram } } */
export const POST = handler(async ({ body, player, now }) => {
  const { player: p, report } = await attackCamp(player, Number(body.level), body.units, now);

  return { ...(await playerView(p, now)), report };
});
