import { clanPublic } from "@/server/clans";
import { standingWith } from "@/server/clanWar";
import { handler } from "@/server/http";
import { GameError } from "@/lib/game/engine";

export const dynamic = "force-dynamic";

/** ?id= — any clan as the world sees it (no treasury, log or requests). */
export const GET = handler(async ({ req, player, now }) => {
  const id = Number(req.nextUrl.searchParams.get("id"));

  if (!Number.isInteger(id) || id <= 0) throw new GameError("No such clan", "not_found");
  const [clan, standing] = await Promise.all([clanPublic(id), standingWith(player, id, now)]);

  // How your clan stands with this one (treaty, war, proposal), to act on it from here.
  return { ...clan, standing };
});
