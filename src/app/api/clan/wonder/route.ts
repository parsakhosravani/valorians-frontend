import { raiseWonder } from "@/server/clans";
import { handler } from "@/server/http";
import { findById, playerView } from "@/server/players";

/** An officer raises the clan's World Wonder one level from the treasury. */
export const POST = handler(async ({ player, now }) => {
  await raiseWonder(player, now);

  return playerView((await findById(player.id)) ?? player, now);
});
