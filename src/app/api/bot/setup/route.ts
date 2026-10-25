import { NextRequest, NextResponse } from "next/server";

import { setupBot, setupKey } from "@/server/bot";

export const dynamic = "force-dynamic";

/**
 * Sets the bot's name, descriptions, command menu, Play button and webhook.
 * Run once after deploying: GET /api/bot/setup?key=<key>. The key is derived
 * from the bot token (see setupKey) so only someone with the token can run it.
 */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("key") !== setupKey()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await setupBot());
}
