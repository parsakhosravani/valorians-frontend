import "@/server/testing/harness";
import { describe, expect, test } from "bun:test";

import { newPlayer, reload } from "@/server/testing/harness";
import { getDb } from "@/server/db";
import { marchTo, resolveDueAttacks } from "@/server/war";
import { homeOf } from "@/server/map";
import { seaRoute, terrainAt } from "@/lib/game/map";
import { mutatePlayer } from "@/server/players";
import { emptyArmy } from "@/lib/game/engine";
import { RESOURCE_IDS } from "@/lib/game/config";

const HOUR = 3600e3;
const total = (r: Record<string, number>) => RESOURCE_IDS.reduce((n, k) => n + r[k], 0);
const axemen = (n: number) => ({ ...emptyArmy(), axeman: n });

/**
 * Moves `def` next door to `atk`, on dry land: new tribes settle at random,
 * and when two landed across the sea from each other an attack needed ships
 * and the test failed now and then ("That's across the sea").
 */
async function nextDoor(atk: { id: number }, def: { id: number }) {
  const db = await getDb();
  const home = await homeOf(atk.id);

  for (let r = 1; r <= 6; r++) {
    for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
      const p = { x: home.x + dx, y: home.y + dy };

      if (["sea", "lake", "mountains"].includes(terrainAt(p.x, p.y))) continue;
      if (seaRoute(home, p, axemen(1)).naval) continue;
      const up = await db.execute({
        sql: "UPDATE users SET map_x = ?, map_y = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM users WHERE map_x = ? AND map_y = ?)",
        args: [p.x, p.y, def.id, p.x, p.y],
      });

      if (up.rowsAffected === 1) return;
    }
  }
  throw new Error("no dry land next door");
}

/** A strong attacker and an undefended target next door, both without shields. */
async function attackerAndTarget(now: number) {
  const atk = await newPlayer(now, (s) => {
    s.army.axeman = 300;
    s.shieldUntil = 0;
  });
  const def = await newPlayer(now, (s) => {
    s.shieldUntil = 0;
  });

  await nextDoor(atk, def);

  return { atk: await reload(atk.id), def: await reload(def.id) };
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

  test("the village's army coming home mid-battle joins the fight and can turn it", async () => {
    const T0 = Date.now();
    const atk = await newPlayer(T0, (s) => {
      s.army.axeman = 300;
      s.shieldUntil = 0;
    });
    const def = await newPlayer(T0, (s) => {
      s.shieldUntil = 0;
      s.army.spearman = 40;
    });
    await nextDoor(atk, def);
    const { march } = await marchTo(await reload(atk.id), { target: def.id }, axemen(300), T0);
    const home = { ...emptyArmy(), spearman: 3000 };

    // The defender's own army is on its way home and gets there just after the attack lands.
    await mutatePlayer(def.id, T0, (s) => {
      s.marches.push({ id: "home", target: "camp", units: { ...home }, loot: { iron: 50, wood: 0, clay: 0, crop: 0 }, coins: 0, returnsAt: march.arrivesAt + 1000 });
      return s;
    });

    await resolveDueAttacks(march.arrivesAt + 1); // the battle starts without them
    await resolveDueAttacks(march.arrivesAt + 2000); // they're home: onto the field
    const db = await getDb();
    const row = (await db.execute({ sql: "SELECT battle, status FROM attacks WHERE id = ?", args: [march.id] })).rows[0];
    const battle = JSON.parse(String(row.battle));

    expect(String(row.status)).toBe("fighting");
    expect(battle.plan.rounds[1].joined.spearman).toBe(3000);
    expect(battle.engaged.spearman).toBe(3040);
    expect((await reload(def.id)).state.joining ?? []).toEqual([]);

    await resolveDueAttacks(march.arrivesAt + 2 * HOUR); // the last round is over
    const [report] = await battlesFor(march.id);

    expect(Number(report.attacker_won)).toBe(0);
    const after = await reload(def.id);
    const lost = JSON.parse(String(report.report)).defenderLosses.spearman;

    expect(after.state.army.spearman).toBe(3040 - lost); // the survivors are home
    expect(after.state.defending ?? []).toEqual([]);
  });

  test("a second wave that lands while the village is fighting joins that battle, against its defenders", async () => {
    const T0 = Date.now();
    const atk = await newPlayer(T0, (s) => {
      s.army.axeman = 320;
      s.shieldUntil = 0;
    });
    const def = await newPlayer(T0, (s) => {
      s.shieldUntil = 0;
      s.army.spearman = 2000;
    });
    await nextDoor(atk, def);
    // A small wave first to pull the defenders onto the field, the main army right behind it.
    const bait = (await marchTo(await reload(atk.id), { target: def.id }, axemen(20), T0)).march;
    const main = (await marchTo(await reload(atk.id), { target: def.id }, axemen(300), T0 + 20_000)).march;
    const db = await getDb();
    const row = async (id: number) => (await db.execute({ sql: "SELECT * FROM attacks WHERE id = ?", args: [id] })).rows[0];

    await resolveDueAttacks(bait.arrivesAt + 1); // the bait's battle starts: the spearmen take the field
    expect(String((await row(bait.id)).status)).toBe("fighting");
    const baitEnds = Number((await row(bait.id)).ends_at);

    expect(main.arrivesAt).toBeLessThan(baitEnds); // the main army lands mid-battle…
    await resolveDueAttacks(main.arrivesAt + 1);
    // …and joins it: no empty village to storm, it fights the defenders already on the field.
    const host = await row(bait.id);
    const battle = JSON.parse(String(host.battle));

    expect(JSON.parse(String((await row(main.id)).battle))).toEqual({ allyOf: bait.id });
    expect(String((await row(main.id)).status)).toBe("fighting");
    expect(battle.allies.map((x: { id: number }) => x.id)).toEqual([main.id]);
    expect(battle.engaged.spearman).toBeGreaterThan(1900);
    expect(Number((await row(main.id)).ends_at)).toBe(Number(host.ends_at));

    await resolveDueAttacks(Number(host.ends_at) + 1);
    expect(String((await row(main.id)).status)).toBe("done");
    const [shared] = await battlesFor(bait.id);
    const [own] = await battlesFor(main.id);

    expect(Number(shared.attacker_won)).toBe(0);
    expect(JSON.parse(String(shared.report)).sent.axeman).toBe(320); // the battle's report: both armies
    const mine = JSON.parse(String(own.report));

    expect(mine.sent.axeman).toBe(300); // the second army's share
    expect(mine.allyOf).toBeTruthy();
    // Troops are conserved: home + marching home + fallen = what was sent.
    const back = await reload(atk.id);
    const home = back.state.army.axeman + back.state.marches.reduce((n, m) => n + (m.units.axeman ?? 0), 0);
    const fell = JSON.parse(String(shared.report)).attackerLosses.axeman;

    expect(home + fell).toBe(320);
  });

  test("two waves landing together, resolved by many callers at once, fight as one battle", async () => {
    const T0 = Date.now();
    const atk = await newPlayer(T0, (s) => {
      s.army.axeman = 320;
      s.shieldUntil = 0;
    });
    const def = await newPlayer(T0, (s) => {
      s.shieldUntil = 0;
      s.army.spearman = 2000;
    });
    await nextDoor(atk, def);
    const bait = (await marchTo(await reload(atk.id), { target: def.id }, axemen(20), T0)).march;
    const main = (await marchTo(await reload(atk.id), { target: def.id }, axemen(300), T0 + 1000)).march;
    const at = main.arrivesAt + 1; // both are due in the same sweep
    await Promise.all([resolveDueAttacks(at, atk.id), resolveDueAttacks(at, def.id), resolveDueAttacks(at), resolveDueAttacks(at)]);
    const db = await getDb();
    const rows = (await db.execute({ sql: "SELECT id, status, battle FROM attacks WHERE id IN (?, ?) ORDER BY id", args: [bait.id, main.id] })).rows;

    expect(rows.map((r) => String(r.status))).toEqual(["fighting", "fighting"]);
    const [b, m] = rows.map((r) => JSON.parse(String(r.battle)));

    expect(b.allies.map((x: { id: number }) => x.id)).toEqual([main.id]); // one battle, the second army in it once
    expect(m).toEqual({ allyOf: bait.id });
  });

  test("an army of another clan still waits at the gates", async () => {
    const T0 = Date.now();
    const one = await newPlayer(T0, (s) => {
      s.army.axeman = 50;
      s.shieldUntil = 0;
    });
    const other = await newPlayer(T0, (s) => {
      s.army.axeman = 50;
      s.shieldUntil = 0;
    });
    const def = await newPlayer(T0, (s) => {
      s.shieldUntil = 0;
      s.army.spearman = 2000;
    });
    await nextDoor(one, def);
    await nextDoor(def, other);
    const first = (await marchTo(await reload(one.id), { target: def.id }, axemen(50), T0)).march;
    const second = (await marchTo(await reload(other.id), { target: def.id }, axemen(50), T0)).march;
    const db = await getDb();
    const at = Math.max(first.arrivesAt, second.arrivesAt) + 1;

    await resolveDueAttacks(at);
    const rows = (await db.execute({ sql: "SELECT status FROM attacks WHERE id IN (?, ?)", args: [first.id, second.id] })).rows;

    expect(rows.map((r) => String(r.status)).sort()).toEqual(["fighting", "marching"]);
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
