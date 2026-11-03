import { createClient } from "@libsql/client";
import { Page, expect } from "@playwright/test";

import { E2E_DB } from "../playwright.config";
import type { GameState } from "../src/lib/game/engine";

let next = 1000 + Math.floor(Math.random() * 1000) * 100;

/** A fresh test player id (the dev login makes the tribe on first visit). */
export const newId = () => next++;

const db = () => createClient({ url: `file:${E2E_DB}` });

/** Opens a screen as player `id`, failing the test on any uncaught page error. */
export async function open(page: Page, id: number, path: string) {
  const errors: string[] = [];

  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${path}${path.includes("?") ? "&" : "?"}dev_user=${id}`);
  await page.waitForLoadState("networkidle");

  return () => expect(errors, "uncaught errors on the page").toEqual([]);
}

/** Changes a player's saved state directly (to set up a late-game tribe). */
export async function editState(id: number, edit: (s: GameState) => void) {
  const c = db();
  const rs = await c.execute({ sql: "SELECT state FROM users WHERE id = ?", args: [id] });

  if (!rs.rows[0]) throw new Error(`player ${id} doesn't exist yet: open a screen as them first`);
  const s = JSON.parse(String(rs.rows[0].state)) as GameState;

  edit(s);
  await c.execute({ sql: "UPDATE users SET state = ?, version = version + 1 WHERE id = ?", args: [JSON.stringify(s), id] });
  c.close();
}

export async function sql(statement: string, args: (string | number | null)[] = []) {
  const c = db();
  const rs = await c.execute({ sql: statement, args });

  c.close();

  return rs;
}

/** A tribe deep in the game: Town Hall 20, maxed military, full stores, people to spare. */
export function lateGame(s: GameState) {
  for (const k of Object.keys(s.buildings)) s.buildings[k] = 12;
  Object.assign(s.buildings, {
    "town-hall": 20,
    "resource-warehouse": 20,
    barracks: 5,
    stable: 10,
    "siege-workshop": 5,
    "exploration-center": 1,
    academy: 10,
    arsenal: 20,
    armory: 20,
    "trading-post": 10,
    "dragon-roost": 0,
  });
  for (const r of ["iron", "wood", "clay", "crop"] as const) s.resources[r] = 600_000;
  s.population = 12_000;
  s.coins = 500_000;
  s.army.spearman = 300;
  s.army.axeman = 300;
}

/** The toast that confirms an action. */
export const toast = (page: Page, text: string | RegExp) => expect(page.getByText(text).first()).toBeVisible();

/** A player's saved state, read straight from the database (what the server has, not what the screen shows). */
export async function stateOf(id: number): Promise<GameState> {
  const rs = await sql("SELECT state FROM users WHERE id = ?", [id]);

  return JSON.parse(String(rs.rows[0].state)) as GameState;
}
