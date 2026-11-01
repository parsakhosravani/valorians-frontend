import "@/server/testing/harness";
import { describe, expect, test } from "bun:test";

import { newPlayer, reload } from "@/server/testing/harness";
import { getDb } from "@/server/db";
import { marchTo, resolveDueAttacks } from "@/server/war";
import { mutatePlayer } from "@/server/players";
import { emptyArmy } from "@/lib/game/engine";
import { RESOURCE_IDS } from "@/lib/game/config";

const HOUR = 3600e3;
const total = (r: Record<string, number>) => RESOURCE_IDS.reduce((n, k) => n + r[k], 0);
const axemen = (n: number) => ({ ...emptyArmy(), axeman: n });

/** A strong attacker and an undefended target, both without shields. */
async function attackerAndTarget(now: number) {
  const atk = await newPlayer(now, (s) => {
    s.army.axeman = 300;
    s.shieldUntil = 0;
  });
  const def = await newPlayer(now, (s) => {
    s.shieldUntil = 0;
  });

  return { atk, def };
}

async function battlesFor(attackId: number) {
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT * FROM battles WHERE attack_id = ?", args: [attackId] });

  return rs.rows;
}

describe("raiding another player (server)", () => {
  test("troops leave, the battle is fought on arrival, loot comes home with them", async () => {
    const T0 = Date.now();
    const { atk, def } = await attackerAndTarget(T0);
    const { march } = await marchTo(atk, { target: def.id }, axemen(300), T0);

    // The army is on the road, not at home.
    expect((await reload(atk.id)).state.army.axeman).toBe(0);

    // Arrival starts the battle; its last round ends a little later.
    await resolveDueAttacks(march.arrivesAt + 1);
    await resolveDueAttacks(march.arrivesAt + HOUR);
    const [report] = await battlesFor(march.id);

    expect(report).toBeDefined();
    expect(Number(report.attacker_won)).toBe(1);
    expect(Number(report.defender_id)).toBe(def.id);

    // What the defender lost is exactly what the army is carrying home:
    // compare with an untouched tribe that produced for the same time.
    const after = await reload(atk.id);
    const homeward = after.state.marches.find((m) => m.target);
    const defender = await reload(def.id);
    const untouched = await newPlayer(T0, (s) => {
      s.shieldUntil = 0;
    });
    const same = await mutatePlayer(untouched.id, defender.state.updatedAt, (s) => s);

    expect(homeward).toBeDefined();
    const carried = total(homeward!.loot as Record<string, number>);

    expect(carried).toBeGreaterThan(0);
    expect(total(same.state.resources) - total(defender.state.resources)).toBeCloseTo(carried, 0);

    // On the attacker's next request after the army is back, troops and loot are home.
    const before = total(after.state.resources);
    const back = await mutatePlayer(atk.id, Math.max(homeward!.returnsAt, after.state.updatedAt) + 1, (s) => s);

    expect(back.state.army.axeman).toBe(homeward!.units.axeman); // the survivors
    expect(back.state.marches.length).toBe(0);
    expect(total(back.state.resources)).toBeGreaterThanOrEqual(before + carried - 1);
  });

  test("many callers resolving at once fight each battle exactly once", async () => {
    const T0 = Date.now();
    const { atk, def } = await attackerAndTarget(T0);
    const { march } = await marchTo(atk, { target: def.id }, axemen(300), T0);

    // The player's request, the after-response sweep and the cron can all run together.
    const callers = (at: number) => [
      resolveDueAttacks(at, atk.id),
      resolveDueAttacks(at, def.id),
      resolveDueAttacks(at),
      resolveDueAttacks(at),
    ];

    await Promise.all(callers(march.arrivesAt + 1)); // arrival: the battle starts
    await Promise.all(callers(march.arrivesAt + HOUR)); // the last round is over

    expect((await battlesFor(march.id)).length).toBe(1);
    const after = await reload(atk.id);

    // One army home-bound, carrying one share of loot — not two.
    expect(after.state.marches.filter((m) => m.target).length).toBe(1);
  });

  test("a shielded tribe can't be raided and the troops stay home", async () => {
    const T0 = Date.now();
    const atk = await newPlayer(T0, (s) => {
      s.army.axeman = 50;
      s.shieldUntil = 0;
    });
    const def = await newPlayer(T0); // new players start shielded

    await expect(marchTo(atk, { target: def.id }, axemen(50), T0)).rejects.toThrow("shield");
    expect((await reload(atk.id)).state.army.axeman).toBe(50);
  });

  test("you can't attack yourself", async () => {
    const T0 = Date.now();
    const atk = await newPlayer(T0, (s) => {
      s.army.axeman = 10;
      s.shieldUntil = 0;
    });

    await expect(marchTo(atk, { target: atk.id }, axemen(10), T0)).rejects.toThrow("yourself");
    expect((await reload(atk.id)).state.army.axeman).toBe(10);
  });
});
