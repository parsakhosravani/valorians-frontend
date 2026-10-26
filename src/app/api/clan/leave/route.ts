import { leaveClan } from "@/server/clans";
import { handler } from "@/server/http";
import { playerView } from "@/server/players";

/** Leaves the clan. A leader's place passes to the longest-serving member. */
export const POST = handler(async ({ player, now }) => playerView(await leaveClan(player), now));
