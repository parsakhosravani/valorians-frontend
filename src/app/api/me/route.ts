import { handler } from "@/server/http";
import { mutatePlayer, playerView } from "@/server/players";

export const dynamic = "force-dynamic";

/** Signs the player in (creating them on first launch) and returns their state. */
export const GET = handler(({ player, now }) => playerView(mutatePlayer(player.id, now, (s) => s), now));
