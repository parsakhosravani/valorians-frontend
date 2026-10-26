import { clanView } from "@/server/clans";
import { handler } from "@/server/http";

export const dynamic = "force-dynamic";

/** Your clan with its members, plus clans to browse. `?q=` filters by name or tag. */
export const GET = handler(({ req, player }) => clanView(player, req.nextUrl.searchParams.get("q") ?? undefined));
