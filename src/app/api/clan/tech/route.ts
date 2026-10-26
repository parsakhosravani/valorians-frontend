import { upgradeTech } from "@/server/clans";
import { handler } from "@/server/http";
import { findById, playerView } from "@/server/players";

/** Body: { tech }. An officer spends the treasury on a clan tech. */
export const POST = handler(async ({ body, player, now }) => {
  await upgradeTech(player, body, now);

  return playerView((await findById(player.id)) ?? player, now);
});
