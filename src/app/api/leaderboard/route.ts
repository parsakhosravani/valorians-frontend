import { handler } from "@/server/http";
import { LeaderboardMetric, leaderboard } from "@/server/war";

export const dynamic = "force-dynamic";

/** ?by=population|power|wins — top 50, your own place, and (below the top) the players around you. */
export const GET = handler(async ({ req, player }) => {
  const by = req.nextUrl.searchParams.get("by");
  const metric: LeaderboardMetric = by === "power" || by === "wins" ? by : "population";

  return leaderboard(player, metric);
});
