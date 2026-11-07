import { GameError } from "@/lib/game/engine";
import { handler } from "@/server/http";
import { relocateOutpost } from "@/server/outposts";
import { playerView } from "@/server/players";

/** Body: { outpost: index, x, y }. Moves that outpost to the land picked on the map. */
export const POST = handler(async ({ player, now, body }) => {
  const pick = { x: Number(body?.x), y: Number(body?.y) };

  if (!Number.isFinite(pick.x) || !Number.isFinite(pick.y)) throw new GameError("Pick a spot on the map", "bad_request");

  return playerView(await relocateOutpost(player, Number(body?.outpost), pick, now), now);
});
