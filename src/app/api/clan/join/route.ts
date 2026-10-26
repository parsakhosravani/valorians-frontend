import { joinClan } from "@/server/clans";
import { handler } from "@/server/http";
import { playerView } from "@/server/players";

/** Body: { id }. Joins an open clan, or asks to join one that takes members by request. */
export const POST = handler(async ({ body, player, now }) => {
  const { player: p, joined } = await joinClan(player, body, now);

  return { ...(await playerView(p, now)), joined };
});
