import { handler } from "@/server/http";
import { LeaderboardMetric, leaderboard } from "@/server/war";

export const dynamic = "force-dynamic";

/** ?by=power|population|wins (power by default, the main ranking) — top 50, your own place, and (below the top) the players around you. */
export const GET = handler(async ({ req, player }) => {
  const by = req.nextUrl.searchParams.get("by");
  const metric: LeaderboardMetric = by === "population" || by === "wins" ? by : "power";

  return leaderboard(player, metric);
});
