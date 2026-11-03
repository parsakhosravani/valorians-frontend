import { NextResponse } from "next/server";

import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * Is the game up? Answers 200 when the server runs and the database answers,
 * 503 otherwise. The launcher (launcher/index.html, on another host) asks it
 * before opening the game, so it needs CORS, no cache and no sign-in.
 */
export async function GET() {
  const headers = { "access-control-allow-origin": "*", "cache-control": "no-store" };

  if (process.env.MAINTENANCE === "on") {
    return NextResponse.json({ ok: false, reason: "maintenance", message: process.env.MAINTENANCE_MESSAGE || null }, { status: 503, headers });
  }
  try {
    const db = await getDb();
    await Promise.race([db.execute("SELECT 1"), new Promise((_, no) => setTimeout(() => no(new Error("database timeout")), 4000))]);

    return NextResponse.json({ ok: true, build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null }, { headers });
  } catch {
    return NextResponse.json({ ok: false, reason: "database" }, { status: 503, headers });
  }
}
