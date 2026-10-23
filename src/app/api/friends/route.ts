import { handler } from "@/server/http";
import { listFriends } from "@/server/players";

export const dynamic = "force-dynamic";

export const GET = handler(({ player }) => listFriends(player.id));
