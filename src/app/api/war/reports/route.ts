import { handler } from "@/server/http";
import { listReports } from "@/server/war";

export const dynamic = "force-dynamic";

/** Your last 30 battles, as attacker or defender. */
export const GET = handler(async ({ player }) => ({ reports: await listReports(player) }), { resolveBattles: true });
