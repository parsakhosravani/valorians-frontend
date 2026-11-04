import { NextRequest, NextResponse } from "next/server";

import { hasLogKey } from "@/server/adminKey";
import { listEvents } from "@/server/eventReport";

export const dynamic = "force-dynamic";

/**
 * Raw events, newest first, to follow up a finding of the report.
 * Filters: from, to (ms), kind ("war." for every war event), player, level, ctx, limit (≤1000).
 */
export async function GET(req: NextRequest) {
  if (!hasLogKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const n = (k: string) => (q.get(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : undefined);
  const events = await listEvents({
    from: n("from"),
    to: n("to"),
    kind: q.get("kind") ?? undefined,
    playerId: n("player"),
    level: q.get("level") ?? undefined,
    ctx: q.get("ctx") ?? undefined,
    limit: n("limit"),
  });

  return NextResponse.json({ count: events.length, events }, { headers: { "cache-control": "no-store" } });
}
