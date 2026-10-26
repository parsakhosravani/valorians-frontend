import { cancelRequest } from "@/server/clans";
import { handler } from "@/server/http";
import { playerView } from "@/server/players";

/** Body: { id }. Withdraws your request to join that clan. */
export const POST = handler(async ({ body, player, now }) => {
  await cancelRequest(player, body);

  return playerView(player, now);
});
