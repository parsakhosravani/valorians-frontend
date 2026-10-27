import "server-only";

import { NextRequest, NextResponse, after } from "next/server";

import { AuthError, AuthResult, authenticate } from "./auth";
import { getOrCreatePlayer, mutatePlayer, Player, playerView } from "./players";
import { resolveDueAttacks } from "./war";
import { resolveDueTrades } from "./trade";

import { GameError, GameState } from "@/lib/game/engine";
import { maybeCheckRelease } from "./announce";

export type ApiError = { error: string; code: string };

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
  await resolveDueAttacks(now).catch((e) => console.error("resolveDueAttacks", e));
  await resolveDueTrades(now).catch((e) => console.error("resolveDueTrades", e));
  await maybeCheckRelease();
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
    try {
      const auth = authenticate(req.headers.get("authorization"));
      const now = Date.now();

      if (opts.resolveBattles) {
        // This player's own battles and trades first, so the response includes them.
        const me = auth.user.id;

        await Promise.all([
          resolveDueAttacks(now, me).catch((e) => console.error("resolveDueAttacks", e)),
          resolveDueTrades(now, me).catch((e) => console.error("resolveDueTrades", e)),
        ]);
        // Everyone else's after the response is sent: the player doesn't wait for it.
        after(sweep);
      }
      const player = await getOrCreatePlayer(auth, now);
      let body: any = {};
      if (req.method !== "GET") {
        body = await req.json().catch(() => ({}));
      }
      const out = await fn({ req, auth, player, now, body });
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (e) {
      if (e instanceof AuthError) return fail(401, e.message, "unauthorized");
      if (e instanceof GameError) return fail(400, e.message, e.code);
      if (e instanceof SyntaxError) return fail(400, "Bad request", "bad_request");
      // eslint-disable-next-line no-console
      console.error(e);
      return fail(500, "Something went wrong", "server_error");
    }
  };
}

/** Shortcut for routes that change game state and return the new view. */
export const action = (apply: (s: GameState, ctx: Ctx) => GameState) =>
  handler(async (ctx) => {
    const p = await mutatePlayer(ctx.player.id, ctx.now, (s) => apply(s, ctx), ctx.player);

    return playerView(p, ctx.now);
  });
