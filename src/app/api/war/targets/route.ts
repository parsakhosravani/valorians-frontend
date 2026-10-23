import { handler } from "@/server/http";
import { findTargets } from "@/server/war";

export const dynamic = "force-dynamic";

/** Tribes you can attack right now, closest to your strength first. */
export const GET = handler(async ({ req, player, now }) => {
  const include = Number(req.nextUrl.searchParams.get("include")) || undefined;

  return { targets: await findTargets(player, now, include) };
});
