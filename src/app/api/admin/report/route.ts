import { NextRequest, NextResponse } from "next/server";

import { hasLogKey } from "@/server/adminKey";
import { dayOf } from "@/server/events";
import { buildReport, lastReport } from "@/server/eventReport";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The flow check of one day of the event log (see eventReport.ts).
 * `?day=2026-11-04` (Tehran day, default today) or `?day=last` for the
 * report kept when the previous day was deleted.
 */
export async function GET(req: NextRequest) {
  if (!hasLogKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const day = req.nextUrl.searchParams.get("day") || dayOf(Date.now());

  if (day === "last") return NextResponse.json((await lastReport()) ?? { error: "No report yet" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: "day must be YYYY-MM-DD or last" }, { status: 400 });

  return NextResponse.json(await buildReport(day), { headers: { "cache-control": "no-store" } });
}
