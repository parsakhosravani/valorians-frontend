import { updateClan } from "@/server/clans";
import { handler } from "@/server/http";
import { findById, playerView } from "@/server/players";

/** Body: any of { flag, description, name, joinMode, minPopulation }. Edits the clan. */
export const POST = handler(async ({ body, player, now }) => {
  await updateClan(player, body, now);

  return playerView((await findById(player.id)) ?? player, now);
});
