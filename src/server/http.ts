import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { AuthError, AuthResult, authenticate } from "./auth";
import { getOrCreatePlayer, mutatePlayer, Player, playerView } from "./players";

import { GameError, GameState } from "@/lib/game/engine";

export type ApiError = { error: string; code: string };

const fail = (status: number, error: string, code: string) =>
  NextResponse.json<ApiError>({ error, code }, { status });

type Ctx = { req: NextRequest; auth: AuthResult; player: Player; now: number; body: any };

/** Wraps a route: authenticates, loads the player, maps errors to JSON. */
export function handler(fn: (ctx: Ctx) => Promise<Response | object> | Response | object) {
  return async (req: NextRequest) => {
    try {
      const auth = authenticate(req.headers.get("authorization"));
      const now = Date.now();
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
    const p = await mutatePlayer(ctx.player.id, ctx.now, (s) => apply(s, ctx));

    return playerView(p, ctx.now);
  });
