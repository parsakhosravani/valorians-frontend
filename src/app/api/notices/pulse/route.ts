import { NextRequest, NextResponse } from "next/server";

import { AuthError, authenticate } from "@/server/auth";
import { noticePulse } from "@/server/notices";

export const dynamic = "force-dynamic";

/**
 * GET: { newest, unread } for the signed-in player's inbox. Asked every few
 * seconds by every open game, so it skips what `handler()` does for real
 * moves: no player load, no battle sweep, and no event-log line per call
 * (that would be thousands an hour of nothing). One indexed query.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = authenticate(req.headers.get("authorization"));

    return NextResponse.json(await noticePulse(auth.user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message, code: "unauthorized" }, { status: 401 });
    console.error("pulse", e);

    return NextResponse.json({ error: "Something went wrong", code: "server_error" }, { status: 500 });
  }
}
