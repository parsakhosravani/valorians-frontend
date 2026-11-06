import "server-only";

import { logEvent } from "./events";
import { getDb } from "./db";
import { homeOf } from "./map";
import { Player, findById, mutatePlayer } from "./players";

import { OUTPOST } from "@/lib/game/config";
import { Army, GameError, advance, foundOutpost, getRates, outpostBlocked } from "@/lib/game/engine";
import { Point, distance, routeMs, seaRoute, terrainAt } from "@/lib/game/map";
import { garrisonOf, headingTo, leaveOutpost, sendToOutpost } from "@/lib/game/garrison";
import { armySize } from "@/lib/game/war";
import { outpostLand, outpostSpots } from "@/lib/game/outpost";

/** Land an outpost can stand on: no sea, lakes or mountain peaks. */
const buildable = (p: Point) => !["sea", "lake", "mountains"].includes(terrainAt(p.x, p.y));

/**
 * Free tiles between OUTPOST.minDistance and maxDistance from home, nearest
 * first, skipping tribes and other outposts, never within
 * OUTPOST.clearOfVillages of another tribe's village (its town on the map) nor
 * within OUTPOST.clearOfOutposts of another outpost. When that ring has no free land (a crowded corner of the map), the
 * search widens a few tiles at a time up to OUTPOST.farthestDistance.
 * Deterministic: the same map always offers the same spots.
 */
export function candidates(home: Point, taken: Set<string>, villages: Point[] = [], outposts: Point[] = []) {
  let out: Point[] = [];

  // Clear of everyone's town first; only a tribe with no such land anywhere in reach settles closer.
  for (const clear of [OUTPOST.clearOfVillages, OUTPOST.clearOfVillagesMin])
    for (let r: number = OUTPOST.maxDistance; ; r = Math.min(OUTPOST.farthestDistance, r + 3)) {
      out = within(home, r, taken, villages, outposts, clear);
      if (out.length) return out;
      if (r >= OUTPOST.farthestDistance) break;
    }

  return out;
}

function within(home: Point, r: number, taken: Set<string>, villages: Point[], outposts: Point[], clear: number) {
  const out: Point[] = [];
  const others = villages.filter((v) => v.x !== home.x || v.y !== home.y);

  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      const p = { x: home.x + dx, y: home.y + dy };
      const d = distance(home, p);

      if (d < OUTPOST.minDistance || d > r) continue;
      if (taken.has(`${p.x},${p.y}`) || !buildable(p)) continue;
      if (others.some((v) => distance(v, p) < clear)) continue;
      if (outposts.some((o) => distance(o, p) < OUTPOST.clearOfOutposts)) continue;
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
  const outposts = outs.rows.map(pt);
  const taken = new Set([...villages, ...outposts].map((p) => `${p.x},${p.y}`));

  return { villages, outposts, taken };
}

/** The spots this tribe is offered for its next outpost: the best land for each resource (see outpostSpots). */
export async function offeredSpots(me: Player) {
  const home = await homeOf(me.id);
  const { villages, outposts, taken } = await around(home);

  return outpostSpots(home, candidates(home, taken, villages, outposts));
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
  const idx = me.state.outposts.length;

  await repairClaims(me, now);
  const home = await homeOf(me.id);
  const { villages, outposts, taken } = await around(home);
  const free = candidates(home, taken, villages, outposts);
  let spots = free.slice(0, 8);

  if (pick) {
    const p = { x: Math.round(Number(pick.x)), y: Math.round(Number(pick.y)) };
    const ok = free.find((c) => c.x === p.x && c.y === p.y);

    if (!ok) throw new GameError("That land can't be settled any more: pick another spot", "taken");
    spots = [ok];
  }

  for (const spot of spots) {
    const claim = await db
      .execute({ sql: "INSERT INTO outposts (user_id, idx, x, y, claimed_at) VALUES (?, ?, ?, ?, ?)", args: [me.id, idx, spot.x, spot.y, now] })
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
  logEvent("outpost.no_land", { home, idx, candidates: free.length, villages: villages.length, taken: taken.size }, { playerId: me.id, at: now, level: "warn" });
  throw new GameError("No free land near your village for an outpost", "no_land");
}

/** A claim younger than this may still be a founding in progress: leave it alone. */
const CLAIM_TIMEOUT_MS = 60_000;

/**
 * Brings the tribe's rows in `outposts` back in line with its state before
 * founding. A request that claimed a tile and then died (a timeout, a crash)
 * before saving the outpost left its row behind; the next founding uses the
 * same number, so every claim failed and the tribe got "No free land" forever,
 * however much land was free. Such rows are dropped once they are older than
 * a founding could take. Outposts in the state with no row get theirs back,
 * so nobody else can settle on them.
 */
async function repairClaims(me: Player, now: number) {
  const db = await getDb();
  const have = me.state.outposts ?? [];
  const stale = await db.execute({
    sql: "DELETE FROM outposts WHERE user_id = ? AND idx >= ? AND claimed_at < ?",
    args: [me.id, have.length, now - CLAIM_TIMEOUT_MS],
  });

  if (stale.rowsAffected) logEvent("outpost.stale_claim", { removed: stale.rowsAffected, outposts: have.length }, { playerId: me.id, at: now, level: "warn" });
  for (const [i, o] of have.entries()) {
    await db.execute({
      sql: "INSERT INTO outposts (user_id, idx, x, y, claimed_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
      args: [me.id, i, o.x, o.y, now],
    });
  }
}

/**
 * Outposts founded before the clearances grew (Nov 2026) can stand on a
 * neighbour's wall, among its buildings, or on top of another outpost. Moves
 * each of those to its owner's best proper spot (see candidates), keeping the
 * land it was founded for when it can (same resource, highest bonus, nearest):
 * its fields, builder and garrison go with it.
 *
 * An outpost troops are marching to, or an army set out from, or one under
 * attack waits: it moves on a later sweep, once the roads are clear, so no
 * march lands somewhere it didn't set out for. Done (meta `outposts_clear_v2`)
 * when nothing is left to move; returns how many moved this time.
 */
export async function moveOutpostsOutOfWalls(now = Date.now()) {
  const db = await getDb();
  const done = await db.execute("SELECT value FROM meta WHERE key = 'outposts_clear_v2'");

  if (done.rows.length) return 0;
  const homes = (await db.execute("SELECT id, map_x AS x, map_y AS y FROM users WHERE map_x IS NOT NULL")).rows.map((r) => ({
    id: Number(r.id),
    x: Number(r.x),
    y: Number(r.y),
  }));
  const homeById = new Map(homes.map((h) => [h.id, h]));
  const outs = (await db.execute("SELECT user_id, idx, x, y FROM outposts ORDER BY user_id, idx")).rows.map((r) => ({
    owner: Number(r.user_id),
    idx: Number(r.idx),
    x: Number(r.x),
    y: Number(r.y),
  }));
  let moved = 0;
  let waiting = 0;

  for (const o of outs) {
    const home = homeById.get(o.owner);

    if (!home) continue;
    // Checked against the map as it is now: an outpost moved a moment ago may have cleared this one.
    const { villages, outposts, taken } = await around(o);
    const others = outposts.filter((p) => p.x !== o.x || p.y !== o.y);
    const cramped =
      villages.some((v) => (v.x !== home.x || v.y !== home.y) && distance(v, o) < OUTPOST.clearOfVillages) ||
      others.some((p) => distance(p, o) < OUTPOST.clearOfOutposts);

    if (!cramped) continue;
    const owner = await findById(o.owner);
    const mine = owner?.state.outposts?.[o.idx];

    if (!owner || !mine || mine.x !== o.x || mine.y !== o.y) continue;
    const busy =
      armySize(garrisonOf(mine)) > 0 ||
      armySize(headingTo(owner.state, o.idx)) > 0 ||
      (
        await db.execute({
          sql: `SELECT 1 FROM attacks WHERE status IN ('marching','resolving','fighting')
                  AND ((attacker_id = ? AND base_outpost = ?) OR (defender_id = ? AND target_outpost = ?)) LIMIT 1`,
          args: [o.owner, o.idx, o.owner, o.idx],
        })
      ).rows.length > 0;

    if (busy) {
      waiting++;
      continue;
    }
    const near = await around(home);
    const want = mine.land ?? outpostLand(o.x, o.y);
    const free = candidates(home, near.taken, near.villages, near.outposts.filter((p) => p.x !== o.x || p.y !== o.y));
    // Nowhere roomier for this tribe: leave it where it is unless it's inside a wall or on an outpost.
    const roomier = free.some((p) => near.villages.every((v) => (v.x === home.x && v.y === home.y) || distance(v, p) >= OUTPOST.clearOfVillages));
    const awful =
      villages.some((v) => (v.x !== home.x || v.y !== home.y) && distance(v, o) < OUTPOST.clearOfVillagesMin) ||
      others.some((p) => distance(p, o) < OUTPOST.clearOfOutposts);

    if (!roomier && !awful) continue;
    const spots = free
      .map((p) => ({ p, land: outpostLand(p.x, p.y) }))
      .sort((a, b) => Number(b.land.resource === want.resource) - Number(a.land.resource === want.resource) || b.land.percent - a.land.percent || distance(home, a.p) - distance(home, b.p))
      .slice(0, 8);

    for (const { p: spot, land } of spots) {
      const up = await db
        .execute({ sql: "UPDATE outposts SET x = ?, y = ? WHERE user_id = ? AND idx = ? AND x = ? AND y = ?", args: [spot.x, spot.y, o.owner, o.idx, o.x, o.y] })
        .catch(() => null); // someone took the tile a moment ago

      if (!up?.rowsAffected) continue;
      await mutatePlayer(o.owner, now, (s) => {
        const it = s.outposts[o.idx];

        if (it && it.x === o.x && it.y === o.y) s.outposts[o.idx] = { ...it, x: spot.x, y: spot.y, land };

        return s;
      });
      logEvent("outpost.moved", { idx: o.idx, from: { x: o.x, y: o.y }, to: spot, land }, { playerId: o.owner, at: now });
      moved++;
      break;
    }
  }
  if (!waiting)
    await db.execute({
      sql: "INSERT INTO meta (key, value) VALUES ('outposts_clear_v2', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [String(moved)],
    });

  return moved;
}

/** The march between a tribe's village and one of its outposts: over land only. */
async function outpostRoad(me: Player, idx: number, units: Army, now: number) {
  const s = advance(me.state, now);
  const o = s.outposts[Math.floor(Number(idx))];

  if (!o) throw new GameError("No such outpost", "not_found");
  const home = await homeOf(me.id);
  const spot = { x: o.x, y: o.y };

  if (seaRoute(home, spot, units).naval) throw new GameError("That outpost is across the sea from your village", "naval");

  return { home, spot, ms: (u: Army) => routeMs(u, home, spot, getRates(s).marchMultiplier) };
}

/** Troops march from the village to outpost `idx` and join its garrison there. */
export async function stationTroops(me: Player, idx: number, units: Army, now: number) {
  const road = await outpostRoad(me, idx, units, now);
  let sent!: Army;
  const p = await mutatePlayer(me.id, now, (s) => {
    const r = sendToOutpost(s, idx, units, road.ms(units), road.home, now, Math.random());

    sent = r.sent;

    return r.state;
  });

  logEvent("outpost.station", { idx, units: sent }, { playerId: me.id, at: now });

  return p;
}

/** Troops of outpost `idx`'s garrison march home to the village. */
export async function bringHome(me: Player, idx: number, units: Army, now: number) {
  const road = await outpostRoad(me, idx, units, now);
  let sent!: Army;
  const p = await mutatePlayer(me.id, now, (s) => {
    const r = leaveOutpost(s, idx, units, road.ms(units), now, Math.random());

    sent = r.sent;

    return r.state;
  });

  logEvent("outpost.home", { idx, units: sent }, { playerId: me.id, at: now });

  return p;
}
