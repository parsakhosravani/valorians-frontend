import { transferLeadership } from "@/server/clans";
import { handler } from "@/server/http";
import { findById, playerView } from "@/server/players";

/** Body: { id }. The leader hands the clan to another member. */
export const POST = handler(async ({ body, player, now }) => {
  await transferLeadership(player, body, now);

  return playerView((await findById(player.id)) ?? player, now);
});
