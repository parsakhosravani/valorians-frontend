import { NextRequest, NextResponse } from "next/server";

import { resolveDueAttacks } from "@/server/war";
import { resolveDueTrades } from "@/server/trade";
import { ensureBotSetup } from "@/server/bot";
import { checkRelease, deliverAnnouncements } from "@/server/announce";
import { settleAll } from "@/server/map";
import { moveOutpostsOutOfWalls } from "@/server/outposts";
import { resettleVillages } from "@/server/resettle";
import { refreshTribeColumns } from "@/server/tribeColumns";
import { maybeRefreshRanks } from "@/server/ranks";
import { errorData, flushEvents, logEvent, withEventContext } from "@/server/events";
import { dailyLogJobs } from "@/server/eventReport";

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

  try {
    return await withEventContext("cron", () => run(started));
  } catch (e) {
    logEvent("cron.run", { ms: Date.now() - started, ...errorData(e) }, { at: started, level: "error" });
    throw e;
  } finally {
    await flushEvents();
  }
}

async function run(started: number) {
  await resolveDueAttacks(started);
  await resolveDueTrades(started);
  // New tribes get their tile on the map here (it used to slow every map request).
  await settleAll().catch((e) =>
    console.error("settling new tribes failed", e)
  );
  // Villages already on the map move to better land nearby, a batch at a time (see resettleVillages).
  await resettleVillages().catch((e) => console.error("resettling villages failed", e));
  // Outposts that went up inside a neighbour's walls move out, once (see moveOutpostsOutOfWalls).
  await moveOutpostsOutOfWalls().catch((e) => console.error("moving outposts out of walls failed", e));
  // Map copies of tribes that went stale (or predate them): a few seconds at most.
  await refreshTribeColumns(started, 8_000).catch((e) =>
    console.error("refreshing tribe columns failed", e)
  );
  await maybeRefreshRanks(started).catch((e) =>
    console.error("refreshing ranks failed", e)
  );
  const bot = await ensureBotSetup().catch(() => null);
  // A new version went live: draft an announcement for the admins to approve.
  const release = await checkRelease().catch((e) => {
    console.error("release check failed", e);

    return null;
  });
  // Announcements still going out: keep sending for the rest of this run.
  await deliverAnnouncements(Math.max(0, 45_000 - (Date.now() - started))).catch((e) =>
    console.error("announcements failed", e)
  );

  // Once a day after midnight (Tehran): yesterday's log is checked, sent to the admins and deleted.
  const log = await dailyLogJobs(started).catch((e) => {
    console.error("daily event log jobs failed", e);
    logEvent("log.purge", errorData(e), { level: "error" });

    return null;
  });

  logEvent("cron.run", { ms: Date.now() - started, ...(log ? { log } : {}) }, { at: started });

  return NextResponse.json({ ok: true, ms: Date.now() - started, ...(bot ? { botSetup: bot } : {}), ...(release ? { release } : {}), ...(log ? { log } : {}) });
}
