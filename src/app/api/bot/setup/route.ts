import { NextResponse } from "next/server";

import { setupBot } from "@/server/bot";

export const dynamic = "force-dynamic";

/**
 * Sets the bot's name, descriptions, command menu, Play button and webhook.
 * It only ever applies the same fixed settings, so it's safe to leave open;
 * it's throttled to once a minute. It also runs by itself from the cron
 * (see ensureBotSetup), so normally nobody needs to call it.
 */
let last = 0;

export async function GET() {
  if (Date.now() - last < 60_000) {
    return NextResponse.json({ ok: false, error: "Ran less than a minute ago, try again shortly" }, { status: 429 });
  }
  last = Date.now();

  return NextResponse.json(await setupBot());
}
