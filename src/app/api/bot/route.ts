import { NextRequest, NextResponse, after } from "next/server";

import { handleUpdate, webhookSecret } from "@/server/bot";
import { maybeCheckRelease } from "@/server/announce";
import { errorData, flushEvents, logEvent, withEventContext } from "@/server/events";

export const dynamic = "force-dynamic";
// Starting an announcement sends a first batch before answering.
export const maxDuration = 30;

/** Telegram webhook for @valorians_bot (set up by /api/bot/setup). */
export async function POST(req: NextRequest) {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let u: any = null;
  const started = Date.now();

  try {
    u = await req.json();
    await withEventContext("bot", () => handleUpdate(u));
    await maybeCheckRelease();
    logEvent("bot.update", updateSummary(u, Date.now() - started), { playerId: fromOf(u), at: started, ctx: "bot" });
  } catch (e) {
    // Always answer 200 so Telegram doesn't retry a broken update forever.
    console.error("bot update failed", e);
    logEvent("bot.update", { ...updateSummary(u, Date.now() - started), ...errorData(e) }, { playerId: fromOf(u), at: started, ctx: "bot", level: "error" });
  }
  after(flushEvents);

  return NextResponse.json({ ok: true });
}

/** Who sent the update (a message, a button tap, a checkout). */
const fromOf = (u: any): number | null =>
  u?.message?.from?.id ?? u?.callback_query?.from?.id ?? u?.pre_checkout_query?.from?.id ?? null;

/** What kind of update it was, without its text (players' messages stay private). */
function updateSummary(u: any, ms: number) {
  const m = u?.message;
  const type = m?.successful_payment ? "payment" : m?.refunded_payment ? "refund" : u?.pre_checkout_query ? "checkout"
    : u?.callback_query ? "button" : m?.text?.startsWith("/") ? "command" : m ? "message" : "other";

  return {
    type,
    ms,
    command: type === "command" ? String(m.text).split(/\s+/)[0].slice(0, 32) : undefined,
    button: type === "button" ? String(u.callback_query.data ?? "").slice(0, 40) : undefined,
  };
}
