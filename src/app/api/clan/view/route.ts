import { clanPublic } from "@/server/clans";
import { handler } from "@/server/http";
import { GameError } from "@/lib/game/engine";

export const dynamic = "force-dynamic";

/** ?id= — any clan as the world sees it (no treasury, log or requests). */
export const GET = handler(async ({ req }) => {
  const id = Number(req.nextUrl.searchParams.get("id"));

  if (!Number.isInteger(id) || id <= 0) throw new GameError("No such clan", "not_found");

  return clanPublic(id);
});
