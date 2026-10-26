import { setRole } from "@/server/clans";
import { handler } from "@/server/http";
import { findById, playerView } from "@/server/players";

/** Body: { id, role: "officer" | "member" }. The leader changes a member's rank. */
export const POST = handler(async ({ body, player, now }) => {
  await setRole(player, body, now);

  return playerView((await findById(player.id)) ?? player, now);
});
