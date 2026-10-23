import { handler } from "@/server/http";
import { mutatePlayer, playerView } from "@/server/players";
import { isChannelMember } from "@/server/telegram";
import { GameError, claimQuest } from "@/lib/game/engine";

/** Body: { quest: "telegram" | "youtube" | "x" } */
export const POST = handler(async ({ body, player, now }) => {
  if (body.quest === "telegram") {
    const member = await isChannelMember(player.id);
    if (member === false) {
      throw new GameError("Join the channel first, then claim", "not_member");
    }
  }
  return playerView(mutatePlayer(player.id, now, (s) => claimQuest(s, body.quest, now)), now);
});
