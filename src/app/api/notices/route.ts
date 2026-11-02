import { handler } from "@/server/http";
import { listNotices, markNoticesRead } from "@/server/notices";

export const dynamic = "force-dynamic";

/** The player's in-game inbox, newest first. */
export const GET = handler(async ({ player }) => ({ notices: await listNotices(player.id) }));

/** Body: { upTo: noticeId }. Marks the inbox read up to the newest notice the player saw. */
export const POST = handler(async ({ body, player }) => {
  const upTo = Math.floor(Number(body.upTo));

  if (Number.isFinite(upTo) && upTo > 0) await markNoticesRead(player.id, upTo);

  return { ok: true };
});
