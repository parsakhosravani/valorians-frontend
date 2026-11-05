import { createRally } from "@/server/clanWar";
import { handler } from "@/server/http";

/** Body: { target: player id, landAt: ms, note? }. An officer calls a clan strike. */
export const POST = handler(async ({ body, player, now }) => ({ rally: await createRally(player, body, now) }));
