import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { sweepSpies } from "@/server/spies";

/** No body. Searches your village for spies (needs a tall enough Watchtower); costs coins. */
export const POST = handler(async ({ player, now }) => {
  const { player: p, sweep } = await sweepSpies(player, now);

  return { ...(await playerView(p, now)), sweep };
});
