import { kickMember } from "@/server/clans";
import { handler } from "@/server/http";
import { playerView } from "@/server/players";

/** Body: { id }. The leader removes that member. */
export const POST = handler(async ({ body, player, now }) => {
  await kickMember(player, body);

  return playerView(player, now);
});
