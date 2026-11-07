import { handler } from "@/server/http";
import { landToChoose } from "@/server/outposts";

/** GET ?move=index: every tile the next outpost (or that outpost, moving) can settle on, for the map. */
export const GET = handler(async ({ req, player, now }) => {
  const move = new URL(req.url).searchParams.get("move");

  return landToChoose(player, now, move == null || move === "" ? undefined : Number(move));
});
