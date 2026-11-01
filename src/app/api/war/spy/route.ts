import { handler } from "@/server/http";
import { playerView } from "@/server/players";
import { plantSpy } from "@/server/spies";

/** Body: { target: playerId }. Plants a spy on that tribe for a day; costs coins, needs an Exploration Center. */
export const POST = handler(async ({ body, player, now }) => {
  const { player: p, spy } = await plantSpy(player, Number(body.target), now);

  return { ...(await playerView(p, now)), spy };
});
