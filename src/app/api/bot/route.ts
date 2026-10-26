import { NextRequest, NextResponse } from "next/server";

import { handleUpdate, webhookSecret } from "@/server/bot";
import { maybeCheckRelease } from "@/server/announce";

export const dynamic = "force-dynamic";
// Starting an announcement sends a first batch before answering.
export const maxDuration = 30;

/** Telegram webhook for @valorians_bot (set up by /api/bot/setup). */
export async function POST(req: NextRequest) {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await handleUpdate(await req.json());
    await maybeCheckRelease();
  } catch (e) {
    // Always answer 200 so Telegram doesn't retry a broken update forever.
    // eslint-disable-next-line no-console
    console.error("bot update failed", e);
  }

  return NextResponse.json({ ok: true });
}
