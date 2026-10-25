import { handler } from "@/server/http";
import { marketView } from "@/server/trade";

export const dynamic = "force-dynamic";

/** The marketplace: other players' open offers, your own offers and merchants on the road. */
export const GET = handler(async ({ player, now }) => marketView(player, now), { resolveBattles: true });
