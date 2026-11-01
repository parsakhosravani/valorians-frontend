/**
 * Test harness for server code: a throwaway SQLite database and helpers to
 * make players. Import it FIRST in a server test, before anything that opens
 * the database, so every test runs against a fresh file instead of real data.
 *
 * bun runs all test files in one process and the database client is shared,
 * so tests never assume an empty database: each one makes its own players
 * with `newPlayer()`, whose ids never repeat.
 */
import "./env";

import { NextRequest } from "next/server";

import { getOrCreatePlayer, findById, mutatePlayer, type Player } from "../players";
import type { GameState } from "@/lib/game/engine";

let nextId = 9_000_000_000 + Math.floor(Math.random() * 1_000_000) * 1000;

/** A brand-new player, optionally with their state changed (e.g. given troops). */
export async function newPlayer(now: number, edit?: (s: GameState) => void, name = "Tester"): Promise<Player> {
  const id = nextId++;
  const p = await getOrCreatePlayer({ user: { id, first_name: `${name} ${id % 1000}` } }, now);

  if (!edit) return p;

  return mutatePlayer(id, now, (s) => {
    edit(s);

    return s;
  });
}

/** The player as saved in the database right now. */
export async function reload(id: number): Promise<Player> {
  const p = await findById(id);

  if (!p) throw new Error(`player ${id} not found`);

  return p;
}

/**
 * Calls an API route handler the way the app does, signed in as player `id`
 * (with the dev login, which the harness switches on). Returns status and JSON.
 */
export async function callRoute(
  route: (req: NextRequest) => Promise<Response>,
  id: number,
  body?: object
): Promise<{ status: number; json: any }> {
  process.env.NEXT_PUBLIC_DEV_LOGIN = "true";
  const req = new NextRequest("http://test.local/api", {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `dev ${id}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await route(req);

  return { status: res.status, json: await res.json() };
}
