import { handler } from "@/server/http";
import { mutatePlayer, playerView } from "@/server/players";
import { advance } from "@/lib/game/engine";

export const dynamic = "force-dynamic";

/**
 * How stale a save may get before /me writes it back. The game is worked out
 * from the save on every read, so writing isn't needed to answer; it only
 * keeps the population/power columns (leaderboard, map) roughly current.
 * Writing on every call (each player polls once a minute) cost a database
 * write per player per minute and raced with taps over the save's version.
 */
const RESAVE_MS = 10 * 60_000;

/** Signs the player in (creating them on first launch) and returns their state. */
export const GET = handler(
  async ({ player, now }) =>
    playerView(
      now - player.state.updatedAt > RESAVE_MS
        ? await mutatePlayer(player.id, now, (s) => s, player)
        : { ...player, state: advance(player.state, now) },
      now,
    ),
  { resolveBattles: true },
);
