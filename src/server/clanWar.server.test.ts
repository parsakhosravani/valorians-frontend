import "@/server/testing/harness";
import { describe, expect, test } from "bun:test";

import { newPlayer, reload } from "@/server/testing/harness";
import { getDb } from "@/server/db";
import { createClan, donate, joinClan, leaveClan } from "@/server/clans";
import {
  alertClan,
  clanWarView,
  createRally,
  diplomacy,
  standingWith,
  recallSupport,
  reconcileSupport,
  resolveSupport,
  sendSupport,
  joinStrike,
  resolveMusters,
} from "@/server/clanWar";
import { marchTo, resolveDueAttacks } from "@/server/war";
import { homeOf, mapView } from "@/server/map";
import { CLAN_WAR } from "@/lib/game/config";
import { emptyArmy, ownArmy, peopleOf, raiseShield } from "@/lib/game/engine";
import { mutatePlayer } from "@/server/players";
import { powerScore } from "@/lib/game/war";
import { seaRoute, terrainAt } from "@/lib/game/map";
import { weekOf, weeklyGoal } from "@/lib/game/clanWar";

const HOUR = 3600e3;
let n = 0;
const uniq = (p: string) => `${p} ${Date.now() % 100000}${n++}`;
const tag = () => `T${(Date.now() + n++) % 9999}`;
const army = (u: Partial<Record<string, number>>) => ({ ...emptyArmy(), ...u });

/** Moves tribe `who` onto free dry land next to `near`, reachable on foot. */
async function nextDoor(near: { id: number }, who: { id: number }) {
  const db = await getDb();
  const home = await homeOf(near.id);

  for (let r = 1; r <= 8; r++) {
    for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
      const p = { x: home.x + dx, y: home.y + dy };

      if (["sea", "lake", "mountains"].includes(terrainAt(p.x, p.y))) continue;
      if (seaRoute(home, p, army({ spearman: 1 })).naval) continue;
      const up = await db.execute({
        sql: "UPDATE users SET map_x = ?, map_y = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM users WHERE map_x = ? AND map_y = ?)",
        args: [p.x, p.y, who.id, p.x, p.y],
      });

      if (up.rowsAffected === 1) return;
    }
  }
  throw new Error("no dry land next door");
}

/** A clan of two (an officer leader and a member) next door to each other. */
async function band(T0: number, edit?: Parameters<typeof newPlayer>[1]) {
  const lead = await createClan(await newPlayer(T0, (s) => { s.coins = 10_000; s.shieldUntil = 0; edit?.(s); }), { name: uniq("Band"), tag: tag() }, T0);
  const mate = await newPlayer(T0, (s) => { s.shieldUntil = 0; edit?.(s); });

  await joinClan(mate, { id: lead.clanId }, T0 + 1);
  await nextDoor(lead, mate);

  return { lead: await reload(lead.id), mate: await reload(mate.id), clanId: lead.clanId! };
}

describe("clans fighting together (server)", () => {
  test("guards march to a clanmate, defend there, take losses, and come home", async () => {
    const T0 = Date.now();
    const { lead, mate } = await band(T0, (s) => { s.army.spearman = 400; });
    const sent = await sendSupport(lead, { to: mate.id, units: army({ spearman: 300 }) }, T0);

    // They left home, and still count for their owner.
    const owner = await reload(lead.id);
    expect(owner.state.army.spearman).toBe(100);
    expect(owner.state.abroad?.[0]).toMatchObject({ hostId: mate.id, status: "marching" });
    expect(peopleOf(owner.state)).toBeGreaterThanOrEqual(peopleOf(lead.state) - 1);

    await resolveSupport(sent.support.arrivesAt + 1);
    const host = await reload(mate.id);
    expect(host.state.army.spearman).toBe(700); // its own 400 + 300 guards
    expect(host.state.guests?.[0]).toMatchObject({ ownerId: lead.id });
    // The host can't send them, and they don't count in its power.
    expect(ownArmy(host.state).spearman).toBe(400);
    const alone = { ...host.state, army: { ...host.state.army, spearman: 400 }, guests: [] };
    expect(powerScore(host.state)).toBe(powerScore(alone));
    await expect(marchTo(host, { camp: 1 }, army({ spearman: 401 }), T0 + 10)).rejects.toThrow(/of your own/);
    expect((await reload(lead.id)).state.abroad?.[0].status).toBe("stationed");

    // A raid on the village: the guards fight and lose their share.
    const raider = await newPlayer(T0, (s) => { s.army.knight = 3000; s.shieldUntil = 0; });
    await nextDoor(mate, raider);
    const { march } = await marchTo(await reload(raider.id), { target: mate.id }, army({ knight: 3000 }), T0 + 20);
    await resolveDueAttacks(march.arrivesAt + 1);
    await resolveDueAttacks(march.arrivesAt + HOUR);
    await reconcileSupport(march.arrivesAt + HOUR);
    const after = await reload(mate.id);
    const guards = after.state.guests?.[0]?.units.spearman ?? 0;
    expect(guards).toBeLessThan(300);
    expect(guards).toBeLessThanOrEqual(after.state.army.spearman);
    const record = (await reload(lead.id)).state.abroad ?? [];
    expect(record[0]?.units.spearman ?? 0).toBe(guards);

    // Called home: off the host, walking back to the owner.
    if (record[0]) {
      const back = await recallSupport(await reload(lead.id), { id: record[0].id }, march.arrivesAt + 2 * HOUR);
      expect(back.state.abroad?.length ?? 0).toBe(0);
      expect(back.state.marches.some((m) => m.units.spearman === guards)).toBe(true);
      expect((await reload(mate.id)).state.guests?.length ?? 0).toBe(0);
    }
  });

  test("leaving the clan sends every guard home", async () => {
    const T0 = Date.now();
    const { lead, mate } = await band(T0, (s) => { s.army.spearman = 100; });
    const sent = await sendSupport(mate, { to: lead.id, units: army({ spearman: 50 }) }, T0);

    await resolveSupport(sent.support.arrivesAt + 1);
    expect((await reload(lead.id)).state.guests?.length).toBe(1);
    await leaveClan(await reload(mate.id), sent.support.arrivesAt + 10);
    expect((await reload(lead.id)).state.guests?.length ?? 0).toBe(0);
    const owner = await reload(mate.id);
    expect(owner.state.abroad?.length ?? 0).toBe(0);
    expect(owner.state.marches.some((m) => m.units.spearman === 50)).toBe(true);
  });

  test("guards go only to clanmates, never the dragon", async () => {
    const T0 = Date.now();
    const { lead } = await band(T0, (s) => { s.army.spearman = 10; s.army.dragon = 1; });
    const stranger = await newPlayer(T0);

    await expect(sendSupport(lead, { to: stranger.id, units: army({ spearman: 5 }) }, T0)).rejects.toThrow(/members of your clan/);
  });

  test("a clanmate under attack alerts the clan once per wave", async () => {
    const T0 = Date.now();
    const { mate } = await band(T0);

    expect(await alertClan(mate.id, "Raider", 600_000, T0)).toBe(1);
    expect(await alertClan(mate.id, "Raider", 600_000, T0 + 60_000)).toBe(0);
    expect(await alertClan(mate.id, "Raider", 600_000, T0 + CLAN_WAR.alertQuietMs + 1)).toBe(1);
  });

  test("a clan strike: armies sent to it land together at the set time", async () => {
    const T0 = Date.now();
    const { lead, mate } = await band(T0, (s) => { s.army.axeman = 50; });
    const target = await newPlayer(T0, (s) => { s.shieldUntil = 0; });

    await nextDoor(lead, target);
    const landAt = T0 + 2 * HOUR;
    const { id } = await createRally(lead, { target: target.id, landAt }, T0);
    const a = await marchTo(await reload(lead.id), { target: target.id, rally: id }, army({ axeman: 50 }), T0 + 1);
    const b = await marchTo(await reload(mate.id), { target: target.id, rally: id }, army({ axeman: 50 }), T0 + 2);

    expect(a.march.arrivesAt).toBe(landAt);
    expect(b.march.arrivesAt).toBe(landAt);
    const view = await clanWarView(await reload(lead.id), T0 + 3);
    expect(view!.rallies[0].armies.length).toBe(2);
    // Members can't call strikes, and a strike needs time to gather.
    await expect(createRally(await reload(mate.id), { target: target.id, landAt }, T0)).rejects.toThrow(/Jarl and Huscarls/);
    await expect(createRally(lead, { target: target.id, landAt: T0 + 60_000 }, T0)).rejects.toThrow(/landing time/);
    // Not onto a shield: a new tribe's protection outlasts any strike.
    const fresh = await newPlayer(T0, (s) => { s.shieldUntil = T0 + 72 * HOUR; });
    await expect(createRally(lead, { target: fresh.id, landAt }, T0)).rejects.toThrow(/shielded/);
  });

  test("treaties stop raids; a war scores raid wins", async () => {
    const T0 = Date.now();
    const one = await band(T0, (s) => { s.army.knight = 500; });
    const two = await band(T0);

    await nextDoor(one.lead, two.mate);
    const twoTag = String((await (await getDb()).execute({ sql: "SELECT tag FROM clans WHERE id = ?", args: [two.clanId] })).rows[0].tag);

    expect((await diplomacy(one.lead, { clan: twoTag, action: "nap" }, T0)).status).toBe("proposed");
    expect((await diplomacy(two.lead, { clan: one.clanId, action: "accept" }, T0)).status).toBe("active");
    await expect(marchTo(await reload(one.lead.id), { target: two.mate.id }, army({ knight: 10 }), T0 + 1)).rejects.toThrow(/treaty/);

    // Breaking it and declaring war: raids are on, and they score.
    expect((await diplomacy(one.lead, { clan: two.clanId, action: "war" }, T0 + 2)).status).toBe("war");
    const { march } = await marchTo(await reload(one.lead.id), { target: two.mate.id }, army({ knight: 500 }), T0 + 3);
    await resolveDueAttacks(march.arrivesAt + 1);
    await resolveDueAttacks(march.arrivesAt + HOUR);
    const view = await clanWarView(await reload(one.lead.id), march.arrivesAt + HOUR);
    const war = view!.relations.find((r) => r.clanId === two.clanId)!;
    expect(war.kind).toBe("war");
    expect(war.score[0] + war.score[1]).toBe(1);

    // Peace takes both sides.
    expect((await diplomacy(two.lead, { clan: one.clanId, action: "peace" }, T0 + 5)).status).toBe("peace");
    expect((await diplomacy(one.lead, { clan: two.clanId, action: "peace" }, T0 + 6)).status).toBe("none");
  });

  test("a clan's page shows how your clan stands with it, and who may act", async () => {
    const T0 = Date.now();
    const one = await band(T0);
    const two = await band(T0);

    expect(await standingWith(one.lead, one.clanId, T0)).toBeNull();
    expect(await standingWith(one.lead, two.clanId, T0)).toEqual({ relation: null, officer: true });
    await diplomacy(one.lead, { clan: two.clanId, action: "ally" }, T0);
    const lead = await standingWith(await reload(two.lead.id), one.clanId, T0);
    expect(lead?.officer).toBe(true);
    expect(lead?.relation).toMatchObject({ kind: "ally", status: "proposed", byUs: false });
    // A plain member sees the standing but can't sign for the clan.
    expect((await standingWith(two.mate, one.clanId, T0))?.officer).toBe(false);
  });

  test("the weekly goal pays every member once", async () => {
    const T0 = Date.now();
    const week = weekOf(T0);
    const goal = weeklyGoal(week, 2);
    const { lead, mate, clanId } = await band(T0, (s) => {
      for (const r of ["iron", "wood", "clay", "crop"] as const) s.resources[r] = 2_000_000;
      s.buildings["resource-warehouse"] = 20;
      s.coins = 1_000_000;
    });
    const db = await getDb();
    const coins0 = (await reload(mate.id)).state.coins;

    // Meet it straight in the table for camps / wins weeks; donations count by themselves.
    if (goal.kind === "donated") {
      await donate(lead, { key: "wood", amount: goal.target }, T0);
    } else {
      await db.execute({
        sql: `INSERT INTO clan_week (clan_id, week, user_id, ${goal.kind}) VALUES (?, ?, ?, ?)`,
        args: [clanId, week, lead.id, goal.target - 1],
      });
      await donate(lead, { key: "wood", amount: 1 }, T0); // any recorded deed re-checks the goal
      const { recordForClan } = await import("@/server/clanWar");
      await recordForClan(lead.id, clanId, goal.kind, 1, T0);
    }
    const paid = (await reload(mate.id)).state.coins;
    expect(paid - coins0).toBeCloseTo(goal.coins, 0);
    // A second push doesn't pay again.
    await donate(lead, { key: "wood", amount: 10 }, T0 + 1);
    expect((await reload(mate.id)).state.coins).toBeCloseTo(paid, 0);
  });

  test("a shield bought after an army set out doesn't send it home", async () => {
    const T0 = Date.now();
    const atk = await newPlayer(T0, (s) => { s.army.knight = 400; s.shieldUntil = 0; });
    const def = await newPlayer(T0, (s) => { s.shieldUntil = 0; s.shield.cooldownUntil = 0; });

    await nextDoor(atk, def);
    const { march } = await marchTo(await reload(atk.id), { target: def.id }, army({ knight: 400 }), T0);

    // They see it coming and buy a shield: the army still lands and fights.
    await mutatePlayer(def.id, T0 + 1000, (s) => raiseShield(s, 8, T0 + 1000));
    await resolveDueAttacks(march.arrivesAt + 1);
    await resolveDueAttacks(march.arrivesAt + HOUR);
    const db = await getDb();
    const fought = await db.execute({ sql: "SELECT 1 FROM battles WHERE attack_id = ?", args: [march.id] });

    expect(fought.rows.length).toBe(1);
    // A new army can't be sent while that shield is up.
    await expect(marchTo(await reload(atk.id), { target: def.id }, army({ knight: 1 }), T0 + 2000)).rejects.toThrow(/shield/);
  });

  test("a strike army waits at home, sets out just in time, and the target hears of it only then", async () => {
    const T0 = Date.now();
    const { lead } = await band(T0, (s) => { s.army.axeman = 60; });
    const target = await newPlayer(T0, (s) => { s.shieldUntil = 0; s.shield.cooldownUntil = 0; });

    await nextDoor(lead, target);
    const landAt = T0 + 6 * HOUR;
    const { id } = await createRally(lead, { target: target.id, landAt }, T0);
    const muster = await joinStrike(await reload(lead.id), id, target.id, army({ axeman: 60 }), T0 + 1);
    const db = await getDb();
    const onRoad = async () => (await db.execute({ sql: "SELECT * FROM attacks WHERE rally_id = ?", args: [id] })).rows;

    expect(muster).not.toBeNull();
    expect(muster!.departAt).toBeGreaterThan(T0 + HOUR);
    // Still at home, still defending; nothing on the road for the target to see.
    expect((await reload(lead.id)).state.army.axeman).toBe(60);
    await resolveMusters(muster!.departAt - 1);
    expect((await onRoad()).length).toBe(0);
    // They buy a shield after the strike was called: it doesn't stop the strike.
    await mutatePlayer(target.id, T0 + 2, (s) => raiseShield(s, 24, T0 + 2));
    await resolveMusters(muster!.departAt + 1);
    const rows = await onRoad();

    expect(rows.length).toBe(1);
    expect(Number(rows[0].arrives_at)).toBe(landAt);
    expect((await reload(lead.id)).state.army.axeman).toBe(0);
  });

  test("the clan's armies show on every member's map: theirs, and those marching on them", async () => {
    const T0 = Date.now();
    const { lead, mate } = await band(T0, (s) => { s.army.axeman = 30; });
    const enemy = await newPlayer(T0, (s) => { s.army.knight = 20; s.shieldUntil = 0; });
    const stranger = await newPlayer(T0, (s) => { s.shieldUntil = 0; });

    await nextDoor(mate, enemy);
    const hit = await marchTo(await reload(enemy.id), { target: mate.id }, army({ knight: 20 }), T0);
    const out = await marchTo(await reload(mate.id), { camp: 1 }, army({ axeman: 30 }), T0 + 1);
    const view = await mapView(await reload(lead.id), T0 + 2);
    const threat = view.movements.find((m) => m.id === hit.march.id);
    const ours = view.movements.find((m) => m.id === out.march.id);

    expect(threat).toMatchObject({ kind: "clan-incoming", clanmate: mate.id, units: null });
    expect(ours).toMatchObject({ kind: "clan-outgoing", clanmate: mate.id });
    expect(ours!.units).toMatchObject({ axeman: 30 });
    // Someone outside the clan sees neither.
    const theirs = await mapView(await reload(stranger.id), T0 + 2);
    expect(theirs.movements.some((m) => m.id === hit.march.id || m.id === out.march.id)).toBe(false);
  });
});
