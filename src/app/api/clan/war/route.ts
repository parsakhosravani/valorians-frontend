import { clanWarView } from "@/server/clanWar";
import { handler } from "@/server/http";

export const dynamic = "force-dynamic";

/** The clan's War tab: members under attack, guard duties, strikes, treaties and wars, the weekly goal. */
export const GET = handler(async ({ player, now }) => ({ war: await clanWarView(player, now) }), { resolveBattles: true });
