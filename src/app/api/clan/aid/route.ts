import { sendAid } from "@/server/clans";
import { handler } from "@/server/http";
import { findById, playerView } from "@/server/players";

/** Body: { id, key, amount }. An officer sends treasury goods to a member. */
export const POST = handler(async ({ body, player, now }) => {
  await sendAid(player, body, now);

  return playerView((await findById(player.id)) ?? player, now);
});
