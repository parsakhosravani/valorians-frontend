import "server-only";

import { getDb } from "./db";
import { homeOf } from "./map";
import { notify } from "./notify";
import { Player, findById, mutatePlayer } from "./players";
import { displayName } from "./war";

import { SPY } from "@/lib/game/config";
import { canSeeSpies, spyCatchChance } from "@/lib/game/spy";
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

const tower = (p: Player, now: number) => advance(p.state, now).buildings["watchtower"] ?? 0;
const explorer = (p: Player, now: number) => advance(p.state, now).buildings["exploration-center"] ?? 0;

/** The players with a spy in `targetId`'s village now (one entry each, however often they extended it). */
async function watchersOf(targetId: number, now: number): Promise<number[]> {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT DISTINCT watcher_id FROM spies WHERE target_id = ? AND until > ?",
    args: [targetId, now],
  });

  return rs.rows.map((r) => Number(r.watcher_id));
}

/** A caught spy is gone at once (with any time it had left). */
async function removeSpy(watcherId: number, targetId: number) {
  const db = await getDb();

  await db.execute({ sql: "DELETE FROM spies WHERE watcher_id = ? AND target_id = ?", args: [watcherId, targetId] });
}

/** How many spies are in this tribe's village, or null if its Watchtower is too low to tell (see SPY.seeLevel). */
export async function spiesInside(p: Player, now: number): Promise<number | null> {
  if (!canSeeSpies(tower(p, now))) return null;

  return (await watchersOf(p.id, now)).length;
}

/**
 * Plants a spy on a tribe for SPY.durationMs (see SPY): needs an Exploration
 * Center, costs coins, at most SPY.maxActive at once, one per tribe (a new
 * one on the same tribe just extends it). The target's Watchtower may catch
 * it (spyCatchChance, against the sender's Exploration Center): then the
 * coins are gone and the target is told who sent it.
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
  const caught = Math.random() < spyCatchChance(tower(target, now), explorer(after, now), "plant");

  if (caught) {
    await notify.spyCaught(targetId, displayName(me), "plant").catch(() => undefined);

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
 * A tribe's army just marched out: every spy on it tries to send word, with
 * what left, the defense left at home, and roughly how long they're away.
 * Slipping out with news is risky: the Watchtower gets another (gentler)
 * roll at each spy, and a caught one sends nothing.
 */
export async function spiesSeeMarch(attacker: Player, sent: Army, travelMs: number, now: number) {
  const watchers = await watchersOf(attacker.id, now);

  if (!watchers.length) return;
  const state = advance(attacker.state, now);
  const watchtower = state.buildings["watchtower"] ?? 0;
  const defense = Math.round(defensePower(state));
  const name = displayName(attacker);

  await Promise.all(
    watchers.map(async (id) => {
      const watcher = await findById(id);

      if (!watcher) return;
      if (Math.random() < spyCatchChance(watchtower, explorer(watcher, now), "report")) {
        await removeSpy(id, attacker.id);
        await Promise.all([
          notify.spyCaught(attacker.id, displayName(watcher), "report"),
          notify.spyLost(id, name, "report"),
        ]).catch(() => undefined);

        return;
      }
      await notify.spyReport(id, name, attacker.id, sent, defense, travelMs * 2).catch(() => undefined);
    }),
  );
}

/**
 * Searches your own village for spies (Watchtower SPY.seeLevel+, costs
 * SPY.sweepCost coins): each spy inside faces one full catch roll. Caught
 * ones are gone and you learn who sent them; the rest stay hidden.
 */
export async function sweepSpies(me: Player, now: number) {
  const watchtower = tower(me, now);

  if (!canSeeSpies(watchtower))
    throw new GameError(`Your Watchtower needs level ${SPY.seeLevel} to search for spies`, "locked");
  const watchers = await watchersOf(me.id, now);

  // Don't take coins for searching an empty village: the count was on screen anyway.
  if (!watchers.length) throw new GameError("There are no spies in your village");
  const after = await mutatePlayer(me.id, now, (s) => {
    if (s.coins < SPY.sweepCost) throw new GameError(`A search costs ${SPY.sweepCost} coins`, "not_enough_coins");
    s.coins -= SPY.sweepCost;

    return s;
  });
  const name = displayName(me);
  const caught: string[] = [];

  for (const id of watchers) {
    const watcher = await findById(id);

    if (!watcher || Math.random() >= spyCatchChance(watchtower, explorer(watcher, now), "sweep")) continue;
    await removeSpy(id, me.id);
    caught.push(displayName(watcher));
    await notify.spyLost(id, name, "sweep").catch(() => undefined);
  }

  return { player: after, sweep: { caught, left: watchers.length - caught.length, cost: SPY.sweepCost } };
}
