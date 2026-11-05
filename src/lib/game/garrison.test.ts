import { describe, expect, test } from "bun:test";

import * as E from "./engine";
import * as G from "./garrison";
import * as W from "./war";
import { OUTPOST } from "./config";

const T0 = Date.UTC(2026, 10, 5, 12);
const HOME = { x: 10, y: 10 };

/** A tribe with one outpost and an army at home. */
const tribe = () => {
  const s = E.createInitialState(T0);
  s.updatedAt = T0;
  s.army.axeman = 800;
  s.army.spearman = 300;
  s.army.longship = 2;
  s.outposts = [{ x: 16, y: 10, foundedAt: T0, fields: { iron: 1, wood: 0, clay: 0, crop: 0 }, land: { resource: "iron", percent: 40 } }];
  return s;
};
const army = (u: Partial<E.Army>) => ({ ...E.emptyArmy(), ...u });

describe("outpost garrisons", () => {
  test("troops march to the outpost, join its garrison, and come home again", () => {
    const s0 = tribe();
    const sent = G.sendToOutpost(s0, 0, army({ axeman: 200 }), 60_000, HOME, T0, 0.3);

    expect(sent.state.army.axeman).toBe(600);
    expect(sent.state.marches[0].to).toBe(0);
    // On the road they're still the tribe's (upkeep, power), and they take room already.
    expect(E.totalArmy(sent.state).axeman).toBe(800);
    expect(G.garrisonRoom(sent.state, 0)).toBe(G.garrisonCap(s0.outposts[0]) - 200);

    const there = E.advance(sent.state, T0 + 60_000);
    expect(G.garrisonOf(there.outposts[0]).axeman).toBe(200);
    expect(there.army.axeman).toBe(600);
    expect(E.totalArmy(there).axeman).toBe(800);

    const back = G.leaveOutpost(there, 0, army({ axeman: 50 }), 60_000, T0 + 60_000, 0.4);
    const home = E.advance(back.state, T0 + 120_000);
    expect(G.garrisonOf(home.outposts[0]).axeman).toBe(150);
    expect(home.army.axeman).toBe(650);
    expect(E.totalArmy(home).axeman).toBe(800);
  });

  test("an outpost holds more as its fields grow, and no more than that", () => {
    const s = tribe();
    expect(G.garrisonCap(s.outposts[0])).toBe(OUTPOST.garrisonBase + OUTPOST.garrisonPerFieldLevel);
    s.army.axeman = 5000;
    expect(() => G.sendToOutpost(s, 0, army({ axeman: 601 }), 1000, HOME, T0, 0.1)).toThrow(/room for 600/);
    const first = G.sendToOutpost(s, 0, army({ axeman: 400 }), 1000, HOME, T0, 0.1).state;
    // Troops already on the road count.
    expect(() => G.sendToOutpost(first, 0, army({ axeman: 201 }), 1000, HOME, T0, 0.2)).toThrow(/room for 200/);
  });

  test("junk is refused: other outposts, more troops than you have, ships, guests", () => {
    const s = tribe();
    expect(() => G.sendToOutpost(s, 3, army({ axeman: 1 }), 1000, HOME, T0, 0.1)).toThrow(/No such outpost/);
    expect(() => G.sendToOutpost(s, -1, army({ axeman: 1 }), 1000, HOME, T0, 0.1)).toThrow(/No such outpost/);
    expect(() => G.sendToOutpost(s, 0, army({ axeman: 900 }), 1000, HOME, T0, 0.1)).toThrow(/only have/);
    expect(() => G.sendToOutpost(s, 0, army({ longship: 1 }), 1000, HOME, T0, 0.1)).toThrow(/Ships/);
    expect(() => G.sendToOutpost(s, 0, army({ axeman: -5 }), 1000, HOME, T0, 0.1)).toThrow(/Bad troop/);
    expect(() => G.leaveOutpost(s, 0, army({ axeman: 1 }), 1000, T0, 0.1)).toThrow(/only have 0/);
    // Clanmates' guards in the village aren't yours to station.
    s.guests = [{ id: 1, from: 9, name: "Ally", units: army({ axeman: 800 }) } as unknown as NonNullable<E.GameState["guests"]>[number]];
    expect(() => G.sendToOutpost(s, 0, army({ axeman: 1 }), 1000, HOME, T0, 0.1)).toThrow(/only have 0/);
  });

  test("an attack sent from an outpost takes its troops from the garrison, never from home", () => {
    const s = tribe();
    s.outposts[0].garrison = army({ axeman: 300 });
    const r = G.withGarrison(s, 0, (g) => W.dispatchRaid(g, army({ axeman: 250 }), T0));

    expect(r.sent.axeman).toBe(250);
    expect(G.garrisonOf(r.state.outposts[0]).axeman).toBe(50);
    expect(r.state.army.axeman).toBe(800);
    expect(() => G.withGarrison(s, 0, (g) => W.dispatchRaid(g, army({ axeman: 301 }), T0))).toThrow();
  });

  test("an army coming back to an outpost joins its garrison; the spoils go home", () => {
    const s = tribe();
    s.marches = [{ id: "m", target: "x", units: army({ axeman: 40 }), loot: { iron: 500, wood: 0, clay: 0, crop: 0 }, coins: 3, returnsAt: T0 + 1000, to: 0 }];
    const iron = s.resources.iron;
    const after = E.advance(s, T0 + 1000);

    expect(G.garrisonOf(after.outposts[0]).axeman).toBe(40);
    expect(after.army.axeman).toBe(800);
    expect(after.resources.iron).toBeGreaterThanOrEqual(iron + 500);
  });

  test("only the garrison fights for an outpost: no walls, no militia, no traps", () => {
    const s = tribe();
    s.buildings["city-gate"] = 15;
    s.buildings.trapmaker = 10;
    s.population = 5000;
    s.outposts[0].garrison = army({ spearman: 100 });
    const field = G.outpostField(s, 0);

    expect(field.army).toEqual(army({ spearman: 100 }));
    expect(field.buildings["city-gate"]).toBe(0);
    expect(W.defensePower(field)).toBeLessThan(W.defensePower({ ...s, army: army({ spearman: 100 }) }));
  });

  test("a battle at an outpost: survivors stay, nothing is looted, troops are conserved", () => {
    const owner = tribe();
    owner.outposts[0].garrison = army({ spearman: 200 });
    const attacker = tribe();
    const sent = army({ axeman: 600 });
    const { outcome, defenders } = W.raidOutcome(G.outpostField(owner, 0), attacker, sent, 0.5);
    const out = G.engageGarrison(owner, 0, defenders);

    expect(G.garrisonOf(out.outposts[0]).spearman).toBe(0);
    const { state, report } = G.defendOutpost(out, 0, attacker, sent, T0, { outcome, engaged: defenders, travelMs: 5000 });
    const left = G.garrisonOf(state.outposts[0]).spearman;

    expect(left).toBe(200 - outcome.defenderLosses.spearman);
    expect(W.armySize(report.loot as unknown as E.Army)).toBe(0);
    expect(report.shieldMs).toBeUndefined();
    expect(state.resources).toEqual(owner.resources);
    expect(state.army).toEqual(owner.army);
  });
});
