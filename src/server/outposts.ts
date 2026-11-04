import "server-only";

import { getDb } from "./db";
import { homeOf } from "./map";
import { Player, mutatePlayer } from "./players";

import { OUTPOST } from "@/lib/game/config";
import { GameError, foundOutpost, outpostBlocked } from "@/lib/game/engine";
import { Point, distance, terrainAt } from "@/lib/game/map";
import { outpostLand, outpostSpots } from "@/lib/game/outpost";

/** Land an outpost can stand on: no sea, lakes or mountain peaks. */
const buildable = (p: Point) => !["sea", "lake", "mountains"].includes(terrainAt(p.x, p.y));

/**
 * Free tiles between OUTPOST.minDistance and maxDistance from home, nearest
 * first, skipping tribes and other outposts, and never within
 * OUTPOST.clearOfVillages of another tribe's village (inside its walls on the
 * map). When that ring has no free land (a crowded corner of the map), the
 * search widens a few tiles at a time up to OUTPOST.farthestDistance.
 * Deterministic: the same map always offers the same spots.
 */
export function candidates(home: Point, taken: Set<string>, villages: Point[] = []) {
  for (let r: number = OUTPOST.maxDistance; ; r = Math.min(OUTPOST.farthestDistance, r + 3)) {
    const out = within(home, r, taken, villages);

    if (out.length || r >= OUTPOST.farthestDistance) return out;
  }
}

function within(home: Point, r: number, taken: Set<string>, villages: Point[]) {
  const out: Point[] = [];
  const others = villages.filter((v) => v.x !== home.x || v.y !== home.y);

  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      const p = { x: home.x + dx, y: home.y + dy };
      const d = distance(home, p);

      if (d < OUTPOST.minDistance || d > r) continue;
      if (taken.has(`${p.x},${p.y}`) || !buildable(p)) continue;
      if (others.some((v) => distance(v, p) < OUTPOST.clearOfVillages)) continue;
      out.push(p);
    }
  }

  return out.sort((a, b) => distance(home, a) - distance(home, b) || a.x - b.x || a.y - b.y);
}

/** Villages and outposts round `home`, far enough out to check every candidate's neighbours. */
async function around(home: Point) {
  const db = await getDb();
  const r = OUTPOST.farthestDistance + OUTPOST.clearOfVillages;
  const [users, outs] = await db.batch(
    [
      {
        sql: "SELECT map_x AS x, map_y AS y FROM users WHERE map_x BETWEEN ? AND ? AND map_y BETWEEN ? AND ?",
        args: [home.x - r, home.x + r, home.y - r, home.y + r],
      },
      { sql: "SELECT x, y FROM outposts WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ?", args: [home.x - r, home.x + r, home.y - r, home.y + r] },
    ],
    "read"
  );
  const pt = (row: Record<string, unknown>) => ({ x: Number(row.x), y: Number(row.y) });
  const villages = users.rows.map(pt);
  const taken = new Set([...villages, ...outs.rows.map(pt)].map((p) => `${p.x},${p.y}`));

  return { villages, taken };
}

/** The spots this tribe is offered for its next outpost: the best land for each resource (see outpostSpots). */
export async function offeredSpots(me: Player) {
  const home = await homeOf(me.id);
  const { villages, taken } = await around(home);

  return outpostSpots(home, candidates(home, taken, villages));
}

/**
 * Founds the tribe's next outpost: on `pick` if given (any free spot the
 * tribe could settle, not only the offered ones), else on the nearest free
 * tile. The tile is claimed first (UNIQUE x, y), then paid for; if paying
 * fails, the tile is let go.
 */
export async function settleOutpost(me: Player, now: number, pick?: Point) {
  const blocked = outpostBlocked(me.state);

  if (blocked) throw new GameError(blocked, "blocked");
  const db = await getDb();
  const home = await homeOf(me.id);
  const { villages, taken } = await around(home);
  const idx = me.state.outposts.length;
  const free = candidates(home, taken, villages);
  let spots = free.slice(0, 8);

  if (pick) {
    const p = { x: Math.round(Number(pick.x)), y: Math.round(Number(pick.y)) };
    const ok = free.find((c) => c.x === p.x && c.y === p.y);

    if (!ok) throw new GameError("That land can't be settled any more: pick another spot", "taken");
    spots = [ok];
  }

  for (const spot of spots) {
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
  if (pick) throw new GameError("That land was just taken: pick another spot", "taken");
  throw new GameError("No free land near your village for an outpost", "no_land");
}

/**
 * Outposts founded before they kept clear of other villages (Nov 2026) could
 * stand inside a neighbour's walls on the map. Moves each of those, once, to
 * its owner's nearest proper spot (see candidates): only the tile changes,
 * its fields and builder go with it. Outposts can't be attacked, so nothing
 * on the road depends on where one stands. Done when meta `outposts_clear_v1`
 * is set; returns how many moved.
 */
export async function moveOutpostsOutOfWalls() {
  const db = await getDb();
  const done = await db.execute("SELECT value FROM meta WHERE key = 'outposts_clear_v1'");

  if (done.rows.length) return 0;
  const homes = (await db.execute("SELECT id, map_x AS x, map_y AS y FROM users WHERE map_x IS NOT NULL")).rows.map((r) => ({
    id: Number(r.id),
    x: Number(r.x),
    y: Number(r.y),
  }));
  const homeById = new Map(homes.map((h) => [h.id, h]));
  const outs = (await db.execute("SELECT user_id, idx, x, y FROM outposts")).rows.map((r) => ({
    owner: Number(r.user_id),
    idx: Number(r.idx),
    x: Number(r.x),
    y: Number(r.y),
  }));
  let moved = 0;

  for (const o of outs) {
    const home = homeById.get(o.owner);

    if (!home) continue;
    const inside = homes.some((h) => h.id !== o.owner && distance(h, o) < OUTPOST.clearOfVillages);

    if (!inside) continue;
    const { villages, taken } = await around(home);

    for (const spot of candidates(home, taken, villages).slice(0, 8)) {
      const up = await db
        .execute({ sql: "UPDATE outposts SET x = ?, y = ? WHERE user_id = ? AND idx = ? AND x = ? AND y = ?", args: [spot.x, spot.y, o.owner, o.idx, o.x, o.y] })
        .catch(() => null); // someone took the tile a moment ago

      if (!up?.rowsAffected) continue;
      await mutatePlayer(o.owner, Date.now(), (s) => {
        const mine = s.outposts[o.idx];

        if (mine && mine.x === o.x && mine.y === o.y) s.outposts[o.idx] = { ...mine, x: spot.x, y: spot.y, land: outpostLand(spot.x, spot.y) };

        return s;
      });
      moved++;
      break;
    }
  }
  await db.execute({
    sql: "INSERT INTO meta (key, value) VALUES ('outposts_clear_v1', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: [String(moved)],
  });

  return moved;
}
