import "server-only";

import { NextRequest, NextResponse, after } from "next/server";

import { AuthError, AuthResult, authenticate } from "./auth";
import { getOrCreatePlayer, mutatePlayer, Player, playerView } from "./players";
import { resolveDueAttacks } from "./war";
import { resolveDueTrades } from "./trade";
import { resolveMusters, resolveSupport } from "./clanWar";

import { GameError, GameState } from "@/lib/game/engine";
import { maybeCheckRelease } from "./announce";
import { maybeRefreshRanks } from "./ranks";
import { neverConnected } from "./db";
import { errorData, flushEvents, logEvent, safeBody, withEventContext } from "./events";

type ApiError = { error: string; code: string };

const fail = (status: number, error: string, code: string) =>
  NextResponse.json<ApiError>({ error, code }, { status });

/**
 * Fights every due battle and delivers every due trade, at most once every few
 * seconds per server instance. Runs after responses (and from the cron), so
 * results land even for players who aren't online.
 */
let lastSweep = 0;

async function sweep() {
  const now = Date.now();

  if (now - lastSweep < 5_000) return;
  lastSweep = now;
  await withEventContext("sweep", async () => {
    await resolveDueAttacks(now).catch((e) => console.error("resolveDueAttacks", e));
    await resolveDueTrades(now).catch((e) => console.error("resolveDueTrades", e));
    await resolveSupport(now).catch((e) => console.error("resolveSupport", e));
    await resolveMusters(now).catch((e) => console.error("resolveMusters", e));
    await maybeCheckRelease();
    // At most once a minute for the whole game (see ranks.ts).
    await maybeRefreshRanks(now).catch((e) => console.error("maybeRefreshRanks", e));
  });
  await flushEvents();
}

type Ctx = { req: NextRequest; auth: AuthResult; player: Player; now: number; body: any };

/**
 * Wraps a route: authenticates, loads the player, maps errors to JSON.
 * `resolveBattles` first fights any battles whose armies have arrived, so the
 * player's state includes their results.
 */
export function handler(
  fn: (ctx: Ctx) => Promise<Response | object> | Response | object,
  opts: { resolveBattles?: boolean } = {}
) {
  return async (req: NextRequest) => {
    const path = new URL(req.url).pathname;
    const label = `${req.method} ${path}`;
    const started = Date.now();
    let playerId: number | null = null;
    let body: any = {};
    // One "api" event per call: who, what they sent, how it ended and how long it took.
    const done = (status: number, code: string | null, extra: object = {}) => {
      logEvent("api", { method: req.method, path, status, code, ms: Date.now() - started, body: safeBody(body), ...extra }, {
        playerId,
        at: started,
        ctx: label,
        level: status >= 500 ? "error" : status >= 400 && code !== "unauthorized" ? "warn" : "info",
      });
      // Written after the response is sent: the player never waits for the log.
      try {
        after(flushEvents);
      } catch {
        void flushEvents(); // outside a request (tests)
      }
    };

    return withEventContext(label, async () => {
    try {
      const auth = authenticate(req.headers.get("authorization"));
      const now = Date.now();

      playerId = auth.user.id;

      if (opts.resolveBattles) {
        // This player's own battles and trades first, so the response includes them.
        const me = auth.user.id;

        await Promise.all([
          resolveDueAttacks(now, me).catch((e) => console.error("resolveDueAttacks", e)),
          resolveDueTrades(now, me).catch((e) => console.error("resolveDueTrades", e)),
          resolveSupport(now, me).catch((e) => console.error("resolveSupport", e)),
        ]);
        // Everyone else's after the response is sent: the player doesn't wait for it.
        after(sweep);
      }
      const player = await getOrCreatePlayer(auth, now);
      if (req.method !== "GET") {
        body = await req.json().catch(() => ({}));
      }
      const out = await fn({ req, auth, player, now, body });
      const res = out instanceof Response ? out : NextResponse.json(out);

      done(res.status, null);

      return res;
    } catch (e) {
      if (e instanceof AuthError) {
        done(401, "unauthorized");

        return fail(401, e.message, "unauthorized");
      }
      if (e instanceof GameError) {
        done(400, e.code, { error: e.message });

        return fail(400, e.message, e.code);
      }
      if (e instanceof SyntaxError) {
        done(400, "bad_request");

        return fail(400, "Bad request", "bad_request");
      }
      console.error(e);
      // The database didn't answer (even after a retry, see fetchRetrying): nothing was changed.
      if (neverConnected(e)) {
        done(503, "db_unreachable", errorData(e));

        return fail(503, "Connection trouble. Try again in a moment.", "db_unreachable");
      }
      done(500, "server_error", errorData(e));

      return fail(500, "Something went wrong", "server_error");
    }
    });
  };
}

/** Shortcut for routes that change game state and return the new view. */
export const action = (apply: (s: GameState, ctx: Ctx) => GameState) =>
  handler(async (ctx) => {
    const p = await mutatePlayer(ctx.player.id, ctx.now, (s) => apply(s, ctx), ctx.player);

    return playerView(p, ctx.now);
  });
