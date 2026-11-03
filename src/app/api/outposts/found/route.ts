import { handler } from "@/server/http";
import { settleOutpost } from "@/server/outposts";
import { playerView } from "@/server/players";
import { GameError } from "@/lib/game/engine";

/** Body: { x?, y? }. Founds the tribe's next outpost on the spot picked, or on the nearest free land. */
export const POST = handler(async ({ player, now, body }) => {
  const picked = body?.x != null || body?.y != null;
  const pick = picked ? { x: Number(body.x), y: Number(body.y) } : undefined;

  if (pick && (!Number.isFinite(pick.x) || !Number.isFinite(pick.y))) throw new GameError("Pick a spot on the map", "bad_request");

  return playerView(await settleOutpost(player, now, pick), now);
});
