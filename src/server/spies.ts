import "server-only";

import { getDb } from "./db";
import { homeOf } from "./map";
import { notify } from "./notify";
import { Player, findById, mutatePlayer } from "./players";
import { displayName } from "./war";

import { SPY } from "@/lib/game/config";
import { GameError, advance, getRates } from "@/lib/game/engine";
import { distance, scoutCost } from "@/lib/game/map";
import { defensePower } from "@/lib/game/war";
import type { Army } from "@/lib/game/engine";

/** What planting a spy on a tribe costs, by how far away it is. */
export const spyCost = (dist: number) => scoutCost(dist) * SPY.costFactor;

/** The tribes you have spies on now, and until when (by tribe id). */
export async function mySpies(meId: number, now: number): Promise<Map<number, number>> {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT target_id, MAX(until) AS until FROM spies WHERE watcher_id = ? AND until > ? GROUP BY target_id",
    args: [meId, now],
  });

  return new Map(rs.rows.map((r) => [Number(r.target_id), Number(r.until)]));
}

/**
 * Plants a spy on a tribe for SPY.durationMs (see SPY): needs an Exploration
 * Center, costs coins, at most SPY.maxActive at once, one per tribe (a new
 * one on the same tribe just extends it). The target's Watchtower may catch
 * it: then the coins are gone and the target is told who sent it.
 */
export async function plantSpy(me: Player, targetId: number, now: number) {
  if (!getRates(me.state).canScout) throw new GameError("Build an Exploration Center to send spies", "locked");
  if (targetId === me.id) throw new GameError("That's your own tribe");
  const target = await findById(targetId);

  if (!target) throw new GameError("That tribe doesn't exist");
  const spies = await mySpies(me.id, now);

  if (!spies.has(targetId) && spies.size >= SPY.maxActive)
    throw new GameError(`You can have ${SPY.maxActive} spies out at once`, "too_many");
  const [home, there] = await Promise.all([homeOf(me.id), homeOf(targetId)]);
  const cost = spyCost(distance(home, there));
  const after = await mutatePlayer(me.id, now, (s) => {
    if (s.coins < cost) throw new GameError(`A spy costs ${cost} coins`, "not_enough_coins");
    s.coins -= cost;

    return s;
  });
  const watchtower = target.state.buildings["watchtower"] ?? 0;
  const caught = Math.random() < Math.min(SPY.catchMax, watchtower * SPY.catchPerLevel);

  if (caught) {
    await notify.spyCaught(targetId, displayName(me)).catch(() => undefined);

    return { player: after, spy: { caught: true, until: null as number | null, cost } };
  }
  const db = await getDb();
  const until = Math.max(spies.get(targetId) ?? 0, now) + SPY.durationMs;

  await db.execute({
    sql: "INSERT INTO spies (watcher_id, target_id, placed_at, until) VALUES (?, ?, ?, ?)",
    args: [me.id, targetId, now, until],
  });

  return { player: after, spy: { caught: false, until, cost } };
}

/**
 * A tribe's army just marched out: every spy on it sends word, with what
 * left, the defense left at home, and roughly how long they're away.
 */
export async function spiesSeeMarch(attacker: Player, sent: Army, travelMs: number, now: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT DISTINCT watcher_id FROM spies WHERE target_id = ? AND until > ?",
    args: [attacker.id, now],
  });

  if (!rs.rows.length) return;
  const defense = Math.round(defensePower(advance(attacker.state, now)));

  await Promise.all(
    rs.rows.map((r) =>
      notify
        .spyReport(Number(r.watcher_id), displayName(attacker), attacker.id, sent, defense, travelMs * 2)
        .catch(() => undefined),
    ),
  );
}
