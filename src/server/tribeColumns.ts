import "server-only";

import type { Row } from "@libsql/client";

import { getDb } from "./db";

import { GameState, advance, normalizeState } from "@/lib/game/engine";
import { DefenseSnapshot, defenseAt, defenseSnapshot } from "@/lib/game/war";

/**
 * What other players see of a tribe on the map, kept in columns next to its
 * state. The map used to load every village's whole state (a few KB each, up
 * to 300 of them) and work it forward to now, only to show its Town Hall,
 * Harbor and defense. Now each save copies those out (see defenseSnapshot),
 * and the map reads the state only for a village whose copy has gone stale.
 */
export const TRIBE_COLUMNS = [
  "town_hall",
  "harbor",
  "def_troops",
  "def_bonus",
  "def_wall",
  "def_pop",
  "def_growth",
  "def_at",
  "def_until",
];

export const tribeColumns = (s: GameState) => {
  const d = defenseSnapshot(s);

  return [s.buildings["town-hall"] ?? 0, s.buildings["harbor"] ?? 0, d.troops, d.bonus, d.wall, d.pop, d.growth, d.at, d.until];
};

/** The columns map.ts selects for a village (with `u` for users). */
export const TRIBE_SELECT = TRIBE_COLUMNS.map((c) => `u.${c}`).join(", ");

/** SQL true when the row's copy is still good at `?` (now). */
export const TRIBE_FRESH = "(u.def_until IS NULL OR u.def_until > ?)";

export type TribeLook = { townHall: number; harbor: number; defense: number };

/** A village as others see it at `now`, from its columns, or from its state when they're stale. */
export function tribeLook(row: Row, now: number): TribeLook {
  if (row.state != null) {
    const s = advance(normalizeState(JSON.parse(String(row.state))), now);
    const d = defenseSnapshot(s);

    return { townHall: s.buildings["town-hall"] ?? 0, harbor: s.buildings["harbor"] ?? 0, defense: defenseAt(d, now) };
  }
  const d: DefenseSnapshot = {
    troops: Number(row.def_troops),
    bonus: Number(row.def_bonus),
    wall: Number(row.def_wall),
    pop: Number(row.def_pop),
    growth: Number(row.def_growth),
    at: Number(row.def_at),
    until: row.def_until == null ? null : Number(row.def_until),
  };

  return { townHall: Number(row.town_hall), harbor: Number(row.harbor), defense: defenseAt(d, now) };
}

/**
 * Brings stale copies up to date: tribes saved before these columns existed,
 * and tribes nobody has saved since something on them changed (a building
 * finished while they were away). Only the columns are written, worked out
 * from the state brought forward to now; the state itself is left as it is,
 * and a tribe saved in the meantime (a new version) is skipped, its save
 * already wrote fresh columns. Run by the cron, `perBatch` tribes at a time
 * for up to `budgetMs`.
 */
export async function refreshTribeColumns(now: number, budgetMs: number, perBatch = 200) {
  const db = await getDb();
  const started = Date.now();
  let done = 0;

  while (Date.now() - started < budgetMs) {
    const rs = await db.execute({
      sql: "SELECT id, version, state FROM users WHERE def_until <= ? ORDER BY def_until ASC LIMIT ?",
      args: [now, perBatch],
    });

    if (!rs.rows.length) break;
    await db.batch(
      rs.rows.map((r) => {
        const s = advance(normalizeState(JSON.parse(String(r.state))), now);

        return {
          sql: `UPDATE users SET ${TRIBE_COLUMNS.map((c) => `${c} = ?`).join(", ")} WHERE id = ? AND version = ?`,
          args: [...tribeColumns(s), Number(r.id), Number(r.version)],
        };
      }),
      "write",
    );
    done += rs.rows.length;
    // A row skipped for its version still looks stale; stop instead of reading it again.
    if (rs.rows.length < perBatch) break;
  }

  return done;
}
