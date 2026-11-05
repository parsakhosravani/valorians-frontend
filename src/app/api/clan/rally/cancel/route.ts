import { cancelRally } from "@/server/clanWar";
import { handler } from "@/server/http";

/** Body: { id }. An officer calls off a strike. */
export const POST = handler(async ({ body, player, now }) => {
  await cancelRally(player, body, now);

  return { ok: true };
});
