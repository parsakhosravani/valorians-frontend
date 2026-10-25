import { handler } from "@/server/http";
import { playerView, setAvatar } from "@/server/players";

/** Body: { avatar: "<portrait id>" } to pick a portrait, or { avatar: null } to use the Telegram photo. */
export const POST = handler(async ({ body, player, now }) => {
  const p = await setAvatar(player, body.avatar ?? null);

  return playerView(p, now);
});
