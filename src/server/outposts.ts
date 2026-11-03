import "server-only";

import { getDb } from "./db";
import { homeOf } from "./map";
import { Player, mutatePlayer } from "./players";

import { OUTPOST } from "@/lib/game/config";
import { GameError, foundOutpost, outpostBlocked } from "@/lib/game/engine";
import { Point, distance, terrainAt } from "@/lib/game/map";

/** Land an outpost can stand on: no sea, lakes or mountain peaks. */
const buildable = (p: Point) => !["sea", "lake", "mountains"].includes(terrainAt(p.x, p.y));

/**
 * Free tiles between OUTPOST.minDistance and maxDistance from home, nearest
 * first, skipping tribes and other outposts. Deterministic: the same map
 * always offers the same spots.
 */
function candidates(home: Point, taken: Set<string>) {
  const out: Point[] = [];
  const r = OUTPOST.maxDistance;

  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      const p = { x: home.x + dx, y: home.y + dy };
      const d = distance(home, p);

      if (d < OUTPOST.minDistance || d > OUTPOST.maxDistance) continue;
      if (taken.has(`${p.x},${p.y}`) || !buildable(p)) continue;
      out.push(p);
    }
  }

  return out.sort((a, b) => distance(home, a) - distance(home, b) || a.x - b.x || a.y - b.y);
}

/**
 * Founds the tribe's next outpost on the nearest free tile: the tile is
 * claimed first (UNIQUE x, y), then paid for; if paying fails, the tile is let go.
 */
export async function settleOutpost(me: Player, now: number) {
  const blocked = outpostBlocked(me.state);

  if (blocked) throw new GameError(blocked, "blocked");
  const db = await getDb();
  const home = await homeOf(me.id);
  const r = OUTPOST.maxDistance;
  const near = await db.batch(
    [
      {
        sql: "SELECT map_x AS x, map_y AS y FROM users WHERE map_x BETWEEN ? AND ? AND map_y BETWEEN ? AND ?",
        args: [home.x - r, home.x + r, home.y - r, home.y + r],
      },
      { sql: "SELECT x, y FROM outposts WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ?", args: [home.x - r, home.x + r, home.y - r, home.y + r] },
    ],
    "read"
  );
  const taken = new Set(near.flatMap((rs) => rs.rows.map((row) => `${Number(row.x)},${Number(row.y)}`)));
  const idx = me.state.outposts.length;

  for (const spot of candidates(home, taken).slice(0, 8)) {
    const claim = await db
      .execute({ sql: "INSERT INTO outposts (user_id, idx, x, y) VALUES (?, ?, ?, ?)", args: [me.id, idx, spot.x, spot.y] })
      .catch(() => null);

    if (!claim) continue; // someone took it a moment ago, or this outpost is already being founded
    try {
      return await mutatePlayer(me.id, now, (s) => {
        if (s.outposts.length !== idx) throw new GameError("That outpost was just founded", "conflict");

        return foundOutpost(s, spot, now);
      });
    } catch (e) {
      await db.execute({ sql: "DELETE FROM outposts WHERE user_id = ? AND idx = ?", args: [me.id, idx] });
      throw e;
    }
  }
  throw new GameError("No free land near your village for an outpost", "no_land");
}
