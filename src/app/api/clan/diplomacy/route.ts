import { diplomacy } from "@/server/clanWar";
import { handler } from "@/server/http";

/** Body: { clan: id or tag, action: ally | nap | accept | decline | war | peace | end }. Officers only. */
export const POST = handler(async ({ body, player, now }) => diplomacy(player, body, now));
