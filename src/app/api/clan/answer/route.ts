import { answerRequest } from "@/server/clans";
import { handler } from "@/server/http";
import { findById, playerView } from "@/server/players";

/** Body: { id, accept }. An officer accepts or declines a request to join. */
export const POST = handler(async ({ body, player, now }) => {
  await answerRequest(player, body, now);

  return playerView((await findById(player.id)) ?? player, now);
});
