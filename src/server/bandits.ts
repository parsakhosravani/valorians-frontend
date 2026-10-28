import "server-only";

import { getDb } from "./db";

import { BANDIT } from "@/lib/game/config";
import { Exposure, Lair, lairActive, lairOfCell, lairsIn, lairsOnRoute, routeBox } from "@/lib/game/bandits";
import { Point, marchRoute } from "@/lib/game/map";
import type { Army } from "@/lib/game/engine";

const key = (p: Point) => `${p.x},${p.y}`;

/** Villages within reach of a box, so lairs too close to one are left out. */
async function villagesNear(min: Point, max: Point): Promise<Point[]> {
  const db = await getDb();
  const d = Math.ceil(BANDIT.tribeDistance);
  const rs = await db.execute({
    sql: "SELECT map_x, map_y FROM users WHERE map_x BETWEEN ? AND ? AND map_y BETWEEN ? AND ?",
    args: [min.x - d, max.x + d, min.y - d, max.y + d],
  });

  return rs.rows.map((r) => ({ x: Number(r.map_x), y: Number(r.map_y) }));
}

/** When each of these lairs was last cleared (missing: never). */
async function clearings(lairs: Point[]): Promise<Map<string, { at: number; by: number | null }>> {
  const out = new Map<string, { at: number; by: number | null }>();

  if (!lairs.length) return out;
  const db = await getDb();
  const xs = lairs.map((l) => l.x);
  const ys = lairs.map((l) => l.y);
  const rs = await db.execute({
    sql: "SELECT x, y, cleared_at, cleared_by FROM bandit_lairs WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ?",
    args: [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)],
  });

  for (const r of rs.rows) {
    out.set(`${Number(r.x)},${Number(r.y)}`, {
      at: Number(r.cleared_at),
      by: r.cleared_by == null ? null : Number(r.cleared_by),
    });
  }

  return out;
}

export type LairInfo = Lair & {
  /** Bandits are there at `now`. */
  active: boolean;
  /** Cleared: when the bandits come back. */
  backAt: number | null;
  clearedBy: number | null;
};

/** Every lair in the box, with whether it has bandits right now. */
export async function lairsAround(min: Point, max: Point, now: number): Promise<LairInfo[]> {
  const lairs = lairsIn(min, max, await villagesNear(min, max));
  const cleared = await clearings(lairs);

  return lairs.map((l) => {
    const c = cleared.get(key(l));
    const active = lairActive(c?.at, now);

    return { ...l, active, backAt: active || !c ? null : c.at + BANDIT.respawnMs, clearedBy: active ? null : (c?.by ?? null) };
  });
}

/** The lair on this tile (with its state), or null if there's none. */
export async function lairAt(p: Point, now: number): Promise<LairInfo | null> {
  const c = BANDIT.cell;
  const l = lairOfCell(Math.floor(p.x / c), Math.floor(p.y / c));

  if (!l || l.x !== p.x || l.y !== p.y) return null;

  return (await lairsAround(p, p, now))[0] ?? null;
}

/** Whether the lair on this tile has bandits at time `t`. */
export async function lairManned(p: Point, t: number) {
  return lairActive((await clearings([p])).get(key(p))?.at, t);
}

/** The bandits of this lair are beaten: it stays empty for a while. */
export async function clearLair(p: Point, by: number, at: number) {
  const db = await getDb();

  await db.execute({
    sql: `INSERT INTO bandit_lairs (x, y, cleared_at, cleared_by) VALUES (?, ?, ?, ?)
          ON CONFLICT(x, y) DO UPDATE SET cleared_at = excluded.cleared_at, cleared_by = excluded.cleared_by`,
    args: [p.x, p.y, at, by],
  });
}

/** The manned lairs a trip from `from` to `to` passes within reach of. */
export async function exposureOn(from: Point, to: Point, units: Army | null, now: number): Promise<Exposure[]> {
  const road = marchRoute(from, to);
  const box = routeBox(road);
  const lairs = (await lairsAround(box.min, box.max, now)).filter((l) => l.active);

  return lairsOnRoute(road, lairs, units);
}

/**
 * For checking many roads at once (the market's offers): loads every village
 * and every cleared lair once, then answers which manned lairs each road passes.
 */
export async function roadWatch(now: number) {
  const db = await getDb();
  const [vs, cs] = await db.batch(
    ["SELECT map_x, map_y FROM users WHERE map_x IS NOT NULL", "SELECT x, y, cleared_at FROM bandit_lairs"],
    "read"
  );
  const villages = vs.rows.map((r) => ({ x: Number(r.map_x), y: Number(r.map_y) }));
  const cleared = new Map(cs.rows.map((r) => [`${Number(r.x)},${Number(r.y)}`, Number(r.cleared_at)]));

  return (from: Point, to: Point, units: Army | null): Exposure[] => {
    const road = marchRoute(from, to);
    const box = routeBox(road);
    const d = BANDIT.tribeDistance;
    const near = villages.filter((v) => v.x >= box.min.x - d && v.x <= box.max.x + d && v.y >= box.min.y - d && v.y <= box.max.y + d);
    const lairs = lairsIn(box.min, box.max, near).filter((l) => lairActive(cleared.get(key(l)), now));

    return lairsOnRoute(road, lairs, units);
  };
}
