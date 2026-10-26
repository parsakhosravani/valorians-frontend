import { createClan } from "@/server/clans";
import { handler } from "@/server/http";
import { playerView } from "@/server/players";

/** Body: { name, tag, description? }. Founds a clan led by the player; costs coins. */
export const POST = handler(async ({ body, player, now }) => playerView(await createClan(player, body, now), now));
