import { NextRequest, NextResponse } from "next/server";

/**
 * Maintenance switch: set MAINTENANCE=on in the host's environment (and
 * redeploy) to take the game down on purpose, for a migration or an outage
 * upstream. Every screen shows the maintenance page; the API answers 503 with
 * a message the game shows; the bot's webhook keeps working so /start still
 * answers. Production keeps counting: it's worked out from timestamps.
 *
 * It can't help when the host itself is down or the deployment is paused:
 * then none of this code runs (see docs/ARCHITECTURE.md, "When the game is down").
 */
export function proxy(req: NextRequest) {
  if (process.env.MAINTENANCE !== "on") return NextResponse.next();
  const { pathname } = req.nextUrl;

  // The bot keeps answering, and the health check says why the game is down.
  if (pathname.startsWith("/api/bot") || pathname === "/api/health") return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Valorians is being upgraded. Back very soon!", code: "maintenance" },
      { status: 503, headers: { "retry-after": "300" } }
    );
  }
  if (pathname === "/maintenance") return NextResponse.next();

  return NextResponse.rewrite(new URL("/maintenance", req.url));
}

export const config = {
  // Not the game's files (scripts, images, the icon).
  matcher: ["/((?!_next/|images/|bot/|icon.svg|favicon.ico).*)"],
};
