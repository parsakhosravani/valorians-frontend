import { kickMember } from "@/server/clans";
import { handler } from "@/server/http";
import { findById, playerView } from "@/server/players";

/** Body: { id }. The leader or an officer removes a member below them. */
export const POST = handler(async ({ body, player, now }) => {
  await kickMember(player, body, now);

  return playerView((await findById(player.id)) ?? player, now);
});
