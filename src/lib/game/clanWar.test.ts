import { describe, expect, test } from "bun:test";

import { UNIT_IDS } from "./config";
import { Army, applyGuestLosses, clampGuests, createInitialState, emptyArmy, guestArmy, ownArmy, ownedArmy, peopleOf } from "./engine";
import { dispatchSupport, receiveGuest, releaseGuest, weekOf, weekEnds, weeklyGoal, blocksRaids } from "./clanWar";
import { powerScore } from "./war";

const T0 = Date.UTC(2026, 10, 5, 12);
const sum = (a: Army) => UNIT_IDS.reduce((n, u) => n + (a[u] ?? 0), 0);

describe("reinforcements (rules)", () => {
  test("troops sent to guard and back are never made or lost", () => {
    const owner = createInitialState(T0);
    const host = createInitialState(T0);

    owner.army.spearman = 200;
    owner.army.knight = 20;
    host.army.spearman = 50;
    const before = sum(owner.army) + sum(host.army);
    const { state: o1, sent } = dispatchSupport(owner, { ...emptyArmy(), spearman: 150, knight: 20 }, false, {
      id: 1, hostId: 2, hostName: "Host", status: "marching", arrivesAt: T0 + 1,
    });

    expect(sum(o1.army) + sum(sent)).toBe(sum(owner.army));
    // Still the owner's: in its people and power.
    expect(peopleOf(o1)).toBe(peopleOf(owner));
    expect(powerScore(o1)).toBe(powerScore(owner));
    const h1 = receiveGuest(host, { id: 1, ownerId: 1, ownerName: "Owner", units: sent, since: T0 });

    expect(sum(o1.army) + sum(h1.army)).toBe(before);
    expect(ownArmy(h1).spearman).toBe(50);
    expect(powerScore(h1)).toBe(powerScore(host));
    expect(ownedArmy(h1).spearman).toBe(50);
    const { state: h2, units } = releaseGuest(h1, 1);

    expect(h2.army.spearman).toBe(50);
    expect(units).toMatchObject({ spearman: 150, knight: 20 });
  });

  test("guards can't leave mid-battle; the dragon never goes", () => {
    const host = receiveGuest(createInitialState(T0), { id: 7, ownerId: 1, ownerName: "O", units: { ...emptyArmy(), spearman: 5 }, since: T0 });

    host.defending = [{ id: 1, joinBy: T0 + 1 }];
    expect(() => releaseGuest(host, 7)).toThrow(/fighting/);
    const owner = createInitialState(T0);

    owner.army.dragon = 1;
    owner.army.spearman = 1;
    expect(() =>
      dispatchSupport(owner, { ...emptyArmy(), dragon: 1 }, false, { id: 1, hostId: 2, hostName: "H", status: "marching", arrivesAt: T0 })
    ).toThrow(/dragon/);
  });

  test("guests lose the same share as the field, and never number more than the army (fuzz)", () => {
    for (let i = 0; i < 500; i++) {
      const s = createInitialState(T0);
      const own = Math.floor(Math.random() * 500);
      const g1 = Math.floor(Math.random() * 500);
      const g2 = Math.floor(Math.random() * 500);
      let h = receiveGuest(s, { id: 1, ownerId: 1, ownerName: "A", units: { ...emptyArmy(), spearman: g1 }, since: T0 });

      h.army.spearman += own;
      h = receiveGuest(h, { id: 2, ownerId: 2, ownerName: "B", units: { ...emptyArmy(), spearman: g2 }, since: T0 });
      const fielded = { ...h.army };
      const losses = { ...emptyArmy(), spearman: Math.floor(Math.random() * (fielded.spearman + 1)) };

      h.army.spearman -= losses.spearman;
      applyGuestLosses(h, fielded, losses);
      const guests = guestArmy(h).spearman;

      expect(guests).toBeLessThanOrEqual(h.army.spearman);
      expect(guests).toBeGreaterThanOrEqual(0);
      // Roughly their share: within one troop per guest of exact.
      const share = fielded.spearman ? 1 - losses.spearman / fielded.spearman : 1;
      expect(Math.abs(guests - (g1 + g2) * share)).toBeLessThanOrEqual(2);
      // Deserters (or anything else) taking troops: the guests shrink with them.
      h.army.spearman = Math.floor(h.army.spearman / 2);
      clampGuests(h);
      expect(guestArmy(h).spearman).toBeLessThanOrEqual(h.army.spearman);
    }
  });
});

describe("weekly goal and treaties (rules)", () => {
  test("weeks run Monday to Monday (UTC), goals rotate and grow with the clan", () => {
    const monday = Date.UTC(2026, 10, 2); // Mon 2 Nov 2026

    expect(weekOf(monday)).toBe(weekOf(monday + 6.99 * 86400e3));
    expect(weekOf(monday - 1)).toBe(weekOf(monday) - 1);
    expect(weekEnds(weekOf(monday))).toBe(monday + 7 * 86400e3);
    const kinds = new Set([0, 1, 2].map((d) => weeklyGoal(weekOf(monday) + d, 5).kind));

    expect(kinds.size).toBe(3);
    expect(weeklyGoal(10, 10).target).toBe(2 * weeklyGoal(10, 5).target);
  });

  test("allies and pacts block raids, wars don't", () => {
    expect(blocksRaids("ally")).toBe(true);
    expect(blocksRaids("nap")).toBe(true);
    expect(blocksRaids("war")).toBe(false);
    expect(blocksRaids(null)).toBe(false);
  });
});
