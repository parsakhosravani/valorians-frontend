import { handler } from "@/server/http";
import { homeOf, mapView } from "@/server/map";

export const dynamic = "force-dynamic";

/** The world map around your tribe (or ?x=&y=, or ?focus=<playerId>), with camps and armies on the move. */
export const GET = handler(
  async ({ req, player, now }) => {
    const q = req.nextUrl.searchParams;
    const x = q.get("x");
    const y = q.get("y");
    const focus = Number(q.get("focus")) || 0;
    const center = focus ? await homeOf(focus) : x != null && y != null ? { x: Number(x), y: Number(y) } : undefined;

    return mapView(player, now, center);
  },
  { resolveBattles: true }
);
