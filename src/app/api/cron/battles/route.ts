import { NextRequest, NextResponse } from "next/server";

import { resolveDueAttacks } from "@/server/war";
import { resolveDueTrades } from "@/server/trade";
import { ensureBotSetup } from "@/server/bot";
import { checkRelease, deliverAnnouncements } from "@/server/announce";

export const dynamic = "force-dynamic";
// Room to keep sending a big announcement (the workflow waits up to 60s).
export const maxDuration = 60;

/**
 * Fights battles whose armies have arrived (and hands over traded goods), even when nobody has the game
 * open, so results (and bot notifications) go out on time. Called every few
 * minutes by .github/workflows/battles.yml.
 *
 * It only fights battles that are already due (the same thing any player's
 * request does), so it is safe to leave open. Set CRON_SECRET to require
 * `Authorization: Bearer <secret>` anyway.
 */
let last = 0;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Cheap guard against hammering: at most one run every 20 seconds per instance.
  if (Date.now() - last < 20_000) return NextResponse.json({ ok: true, skipped: true });
  last = Date.now();
  const started = Date.now();

  await resolveDueAttacks(started);
  await resolveDueTrades(started);
  const bot = await ensureBotSetup().catch(() => null);
  // A new version went live: draft an announcement for the admins to approve.
  const release = await checkRelease().catch((e) => {
    // eslint-disable-next-line no-console
    console.error("release check failed", e);

    return null;
  });
  // Announcements still going out: keep sending for the rest of this run.
  await deliverAnnouncements(Math.max(0, 45_000 - (Date.now() - started))).catch((e) =>
    // eslint-disable-next-line no-console
    console.error("announcements failed", e)
  );

  return NextResponse.json({ ok: true, ms: Date.now() - started, ...(bot ? { botSetup: bot } : {}), ...(release ? { release } : {}) });
}
