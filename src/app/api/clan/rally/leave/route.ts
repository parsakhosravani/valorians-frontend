import { leaveStrike } from "@/server/clanWar";
import { handler } from "@/server/http";

/** Body: { id }. Takes back your army waiting at home for a clan strike. */
export const POST = handler(async ({ body, player }) => {
  await leaveStrike(player, body);

  return { ok: true };
});
