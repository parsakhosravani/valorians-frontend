import { test, expect } from "bun:test";
import crypto from "crypto";
import * as E from "./engine";
import * as C from "./config";
import { outpostLand, outpostSpots } from "./outpost";
import { verifyInitData } from "../../server/auth";

const T0 = Date.UTC(2026, 9, 23, 10);
test("energy regen and production", () => {
  let s = E.createInitialState(T0);
  s = E.advance(s, T0 + 30 * 60e3);
  expect(Math.round(s.resources.iron)).toBe(2050);
  expect(Math.round(s.coins)).toBe(1005);
});
test("taps rate limited, energy limited, capacity limited", () => {
  let s = E.createInitialState(T0);
  const r1 = E.applyTaps(s, "iron", 1000, T0 + 1000);
  expect(r1.accepted).toBe(60); // 20/s *1 + 40 burst
  expect(r1.state.resources.iron).toBe(2000 + 1800);
  s = r1.state; s.resources.iron = 14995;
  const r2 = E.applyTaps(s, "iron", 5, T0 + 10000);
  expect(r2.accepted).toBe(1); expect(r2.state.resources.iron).toBe(15000);
  const r3 = E.applyTaps(r2.state, "iron", 5, T0 + 20000);
  expect(r3.accepted).toBe(0);
});
test("building upgrade completes and changes rates mid-interval", () => {
  let s = E.createInitialState(T0);
  s = E.upgradeBuilding(s, "iron-mine", T0);
  expect(s.resources.wood).toBe(2000 - 240); // mines are mostly wood and clay (mix 1.6 × 150)
  expect(() => E.upgradeBuilding(s, "sawmill", T0)).toThrow("All builders are busy");
  s = E.advance(s, T0 + 10_000 + 3600e3);
  expect(s.buildings["iron-mine"]).toBe(1);
  expect(s.queue.length).toBe(0);
  // ~1h at 160/h after the 10s build
  expect(Math.round(s.resources.iron)).toBe(Math.round(2000 - 60 + 100 * 10/3600 + 160));
});
test("stamina is daily: no regen, refills at UTC midnight", () => {
  let s = E.createInitialState(T0);
  const cap = E.getRates(s).energyCapacity;
  expect(cap).toBe(1500);
  s.energy = 100;
  s = E.advance(s, T0 + 3600e3);
  expect(s.energy).toBe(100);
  s = E.advance(s, Date.UTC(2026, 9, 24, 0, 1));
  expect(s.energy).toBe(cap);
});

test("combo, crits and frenzy are capped server-side", () => {
  const s = E.createInitialState(T0);
  // Claims 40 taps, all crits, ×5 combo, all frenzy: server trims it.
  const r = E.applyTaps(s, "wood", { taps: 40, crits: 40, comboSum: 200, frenzyTaps: 40 }, T0 + 1000);
  expect(r.accepted).toBe(40);
  // crits capped at 40% (16), combo at ×2, frenzy not allowed (meter empty)
  expect(r.gained).toBe(Math.round(30 * 2 * (40 + 16 * 2)));
  expect(r.state.energy).toBe(1500 - 40 * 10);
});

test("filling the meter starts Frenzy: double, free taps", () => {
  let s = E.createInitialState(T0);
  s.frenzy.meter = 95;
  s = E.applyTaps(s, "iron", { taps: 5 }, T0 + 1000).state;
  expect(E.frenzyActive(s, T0 + 2000)).toBe(true);
  const before = s.energy;
  const r = E.applyTaps(s, "iron", { taps: 10, frenzyTaps: 10, comboSum: 10 }, T0 + 3000);
  expect(r.gained).toBe(30 * 10 * 2);
  expect(r.state.energy).toBe(before);
});

test("streak: claim once a day, grows, resets after a missed day, loops after 7", () => {
  let s = E.createInitialState(T0);
  s = E.claimStreak(s, T0);
  expect(s.streak.count).toBe(1);
  expect(s.coins).toBe(1000 + 200);
  expect(() => E.claimStreak(s, T0 + 3600e3)).toThrow("tomorrow");
  for (let d = 1; d < 7; d++) s = E.claimStreak(s, T0 + d * 86400e3);
  expect(s.streak.count).toBe(7);
  s = E.claimStreak(s, T0 + 7 * 86400e3);
  expect(s.streak.count).toBe(1);
  s = E.claimStreak(s, T0 + 9 * 86400e3); // missed a day
  expect(s.streak.count).toBe(1);
});

test("quests", () => {
  let s = E.createInitialState(T0);
  expect(() => E.claimQuest(s, "x", T0)).toThrow();
  s = E.startQuest(s, "x", T0);
  expect(() => E.claimQuest(s, "x", T0 + 2000)).toThrow();
  s = E.claimQuest(s, "x", T0 + 11000);
  expect(s.coins).toBe(2000); expect(s.bonusGrowth).toBe(4);
  expect(() => E.claimQuest(s, "x", T0 + 12000)).toThrow("already");
});
test("initData verification", () => {
  const token = "123:ABC";
  const user = JSON.stringify({ id: 42, first_name: "Hadi" });
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user, start_param: "abc", query_id: "q" });
  const dcs = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  p.set("hash", crypto.createHmac("sha256", secret).update(dcs).digest("hex"));
  const r = verifyInitData(p.toString(), token);
  expect(r.user.id).toBe(42); expect(r.startParam).toBe("abc");
  expect(() => verifyInitData(p.toString(), "123:XYZ")).toThrow("Invalid signature");
});


// ─── Balance pass ────────────────────────────────────────────────────────────

test("producers yield 15% more each level, and their upgrades pay back in days", () => {
  const s = E.createInitialState(0);
  const mine = E.getRates(s).productionPerHour.iron;
  s.buildings["iron-mine"] = 1;
  expect(E.getRates(s).productionPerHour.iron - mine).toBeCloseTo(60);
  s.buildings["iron-mine"] = 2;
  expect(E.getRates(s).productionPerHour.iron - mine).toBeCloseTo(60 + 69);

  const b = C.BUILDING_BY_ID["iron-mine"];
  const payback = (lvl: number) =>
    C.costTotal(C.buildingUpgradeCost(b, lvl)) / (C.productionAt(60, lvl + 1) - C.productionAt(60, lvl)) / 24; // days
  for (const lvl of [5, 10, 14]) expect(payback(lvl)).toBeLessThan(3);
  // The steep last levels are a long goal, but still pay back within three weeks.
  expect(payback(19)).toBeLessThan(21);
});

test("starving troops desert, the hungriest first, until the rest can be fed", () => {
  const s = E.createInitialState(0);
  s.resources.crop = 0;
  s.army.knight = 100; // 4 crop each: far more than is grown
  s.army.spearman = 100;
  const t = 10 * 3600e3;
  const after = E.advance(s, t);

  expect(after.army.knight).toBeLessThan(100);
  expect(after.army.spearman).toBe(100);
  expect(after.deserted?.count).toBeGreaterThan(0);

  // Fed again: nobody leaves.
  const fed = E.createInitialState(0);
  fed.army.spearman = 10;
  expect(E.advance(fed, t).army.spearman).toBe(10);
});

test("each building's cost is split by what it's made of, keeping the same total", () => {
  for (const b of C.BUILDINGS) {
    const sum = C.RESOURCE_IDS.reduce((t, r) => t + b.mix[r], 0);
    expect(sum).toBeCloseTo(4); // a mix only moves cost between resources
    expect(C.RESOURCE_IDS.every((r) => b.mix[r] > 0)).toBe(true);
  }
  const gate = C.buildingUpgradeCost(C.BUILDING_BY_ID["city-gate"], 5);
  expect(gate.clay).toBeGreaterThan(gate.iron);
  expect(gate.iron).toBeGreaterThan(gate.wood);
  expect(gate.wood).toBeGreaterThan(gate.crop);
  const harbor = C.buildingUpgradeCost(C.BUILDING_BY_ID["harbor"], 5);
  expect(harbor.wood).toBe(Math.max(...C.RESOURCE_IDS.map((r) => harbor[r])));
  expect(harbor.wood).toBeGreaterThan(2 * harbor.clay);
});

test("upgrading takes each resource by the building's mix", () => {
  const s = E.createInitialState(0);
  s.buildings["town-hall"] = 5;
  s.buildings.sawmill = 5; // the Harbor needs it
  for (const r of C.RESOURCE_IDS) s.resources[r] = 100000;
  const cost = E.buildingUpgradeInfo(s, "harbor").cost;
  const after = E.upgradeBuilding(s, "harbor", 0);
  for (const r of C.RESOURCE_IDS) expect(after.resources[r]).toBe(100000 - cost[r]);
});


// ─── Building tops (Nov 2026) ─────────────────────────────────────────────────

const rich = () => {
  const s = E.createInitialState(0);
  for (const r of C.RESOURCE_IDS) s.resources[r] = 1e6;
  return s;
};

test("no building can be raised above the Town Hall; producers may lead by two", () => {
  const s = rich();
  expect(() => E.upgradeBuilding(s, "barracks", 0)).toThrow("Needs Town Hall 1");
  s.buildings["iron-mine"] = 2;
  expect(() => E.upgradeBuilding(s, "iron-mine", 0)).toThrow("Needs Town Hall 1");
  s.buildings["town-hall"] = 1;
  expect(() => E.upgradeBuilding(s, "iron-mine", 0)).not.toThrow();
  expect(() => E.upgradeBuilding(s, "barracks", 0)).not.toThrow();
});

test("buildings stop at their top level", () => {
  const s = rich();
  s.buildings["town-hall"] = 20;
  s.buildings.arsenal = 20;
  s.buildings.barracks = 5;
  expect(() => E.upgradeBuilding(s, "arsenal", 0)).toThrow("top level");
  expect(() => E.upgradeBuilding(s, "barracks", 0)).toThrow("top level");
  expect(() => E.upgradeBuilding(s, "town-hall", 0)).toThrow("top level");
  expect(E.getRates(s).attackBonus).toBeCloseTo(0.4);
});

test("Town Hall: a builder at 10 and 20, and at most half the build time", () => {
  const s = E.createInitialState(0);
  const at = (l: number) => ((s.buildings["town-hall"] = l), E.getRates(s));
  expect(at(9).builders).toBe(1);
  expect(at(10).builders).toBe(2);
  expect(at(20).builders).toBe(3);
  expect(at(20).buildSpeedMultiplier).toBeCloseTo(0.5);
});

test("build times: under a minute at first, about 16 hours for the last level", () => {
  const b = C.BUILDING_BY_ID.arsenal;
  expect(C.buildingUpgradeBaseSeconds(b, 0)).toBeLessThan(60);
  expect(C.buildingUpgradeBaseSeconds(b, 9) / 60).toBeLessThan(30);
  expect(C.buildingUpgradeBaseSeconds(b, 19) / 3600).toBeGreaterThan(12);
  expect(C.buildingUpgradeBaseSeconds(b, 19) / 3600).toBeLessThan(20);
});

test("every upgrade fits in a Warehouse its Town Hall allows", () => {
  const wh = C.BUILDING_BY_ID["resource-warehouse"];
  const capAt = (l: number) => {
    const s = E.createInitialState(0);
    s.buildings["resource-warehouse"] = l;
    return E.getRates(s).capacity;
  };
  for (const b of C.BUILDINGS) {
    for (let l = 0; l < b.maxLevel; l++) {
      // To reach l + 1 the Town Hall must be at least that (or l - 1 for those that lead it).
      const hall = b.id === "town-hall" ? l : Math.max(0, l + 1 - (b.leadsTownHall ? C.TOWN_HALL_LEAD : 0));
      const cost = C.buildingUpgradeCost(b, l);
      const room = capAt(Math.min(wh.maxLevel, hall + C.TOWN_HALL_LEAD));
      for (const r of C.RESOURCE_IDS) expect(cost[r]).toBeLessThanOrEqual(room);
    }
  }
});

test("the last levels are the long climb: maxing a village takes months of production", () => {
  // All of every resource needed to take every building to the top, against the
  // hourly output of all four producers at the top.
  let need = 0;
  for (const b of C.BUILDINGS) for (let l = 0; l < b.maxLevel; l++) need += C.costTotal(C.buildingUpgradeCost(b, l));
  const topOutput = 4 * (C.BASE_PRODUCTION_PER_HOUR + C.productionAt(60, 20));
  const days = need / topOutput / 24;
  expect(days).toBeGreaterThan(60);
  expect(days).toBeLessThan(100);
});

test("old saves above the top come down to it and get the lost levels back, up to a full warehouse", () => {
  const s = E.createInitialState(0);
  s.buildings.arsenal = 30;
  s.buildings.barracks = 9;
  for (const r of C.RESOURCE_IDS) s.resources[r] = 0;
  const after = E.normalizeState(s);
  expect(after.buildings.arsenal).toBe(20);
  expect(after.buildings.barracks).toBe(5);
  const cap = E.getRates(after).capacity;
  for (const r of C.RESOURCE_IDS) expect(after.resources[r]).toBe(cap);
  // Loading it again gives nothing more.
  for (const r of C.RESOURCE_IDS) after.resources[r] = 7;
  expect(E.normalizeState(after).resources.iron).toBe(7);
});

test("the Daily Mine stays a boost: a maxed day is well under a top village's day", () => {
  const day = (lvl: number) => (C.energyCapacityForLevel(lvl) / C.STAMINA_PER_TAP) * C.tapPowerForLevel(lvl);
  const topDay = 24 * 4 * (C.BASE_PRODUCTION_PER_HOUR + C.productionAt(60, 20));
  // Even with the best combo and a maxed Academy.
  expect(day(C.MAX_SKILL_LEVEL) * C.MAX_COMBO_MULTIPLIER * 1.5).toBeLessThan(topDay * 0.5);
  // On day one it's worth about half of what the whole new village makes in a day.
  expect(day(1)).toBeGreaterThan(24 * 2 * C.BASE_PRODUCTION_PER_HOUR * 0.9);
});

// ─── Unlock tree, Mastery, queue controls ─────────────────────────────────────

test("the village opens up step by step: buildings need others first", () => {
  const s = rich();
  s.buildings["town-hall"] = 20;
  expect(() => E.upgradeBuilding(s, "stable", 0)).toThrow("Needs Barracks 3");
  s.buildings.barracks = 3;
  expect(() => E.upgradeBuilding(s, "stable", 0)).not.toThrow();
  expect(() => E.upgradeBuilding(s, "dragon-roost", 0)).toThrow("Needs Stable 10");
  // Only the first level checks it: a building already standing keeps growing.
  s.buildings.watchtower = 4;
  s.buildings["city-gate"] = 0;
  expect(() => E.upgradeBuilding(s, "watchtower", 0)).not.toThrow();
  // Every requirement names a real building, and nothing needs itself.
  for (const b of C.BUILDINGS) for (const r of b.requires) {
    expect(C.BUILDING_BY_ID[r.building]).toBeDefined();
    expect(r.building).not.toBe(b.id);
    expect(r.level).toBeLessThanOrEqual(C.BUILDING_BY_ID[r.building].maxLevel);
  }
});

test("a maxed building earns Mastery stars that add half a level each", () => {
  let s = rich();
  s.buildings["town-hall"] = 20;
  s.buildings.arsenal = 19;
  expect(E.masteryInfo(s, "arsenal").blocked).toBe("Reach level 20 first");
  s.buildings.arsenal = 20;
  const before = E.getRates(s).attackBonus;
  s = E.masterBuilding(s, "arsenal", 0);
  expect(s.queue[0]).toMatchObject({ building: "arsenal", mastery: true, toLevel: 1 });
  s = E.advance(s, s.queue[0].endsAt + 1);
  expect(s.mastery.arsenal).toBe(1);
  expect(s.buildings.arsenal).toBe(20);
  expect(E.getRates(s).attackBonus).toBeCloseTo(before + 0.01); // half of 2%
  s.mastery.arsenal = C.MASTERY.stars;
  expect(E.getRates(s).attackBonus).toBeCloseTo(0.45);
  expect(E.masteryInfo(s, "arsenal").blocked).toBe("Fully mastered");
  // Unlock-only buildings and the Town Hall have nothing to master.
  s.buildings.barracks = 5;
  expect(E.masteryInfo(s, "barracks").blocked).toBe("Nothing to master");
  expect(E.masteryInfo(s, "town-hall").blocked).toBe("Nothing to master");
  // Stars only count while the building stands at its top (rams can knock a gate down).
  s.buildings["city-gate"] = 20;
  s.mastery["city-gate"] = 5;
  const top = E.getRates(s).wallBonus;
  s.buildings["city-gate"] = 19;
  expect(E.getRates(s).wallBonus).toBeCloseTo(top - 0.03 - 0.075);
});

test("cancelling gives everything back in the first minute, 80% after, and frees the builder", () => {
  const s = rich();
  s.buildings["town-hall"] = 5;
  const started = E.upgradeBuilding(s, "iron-mine", 0);
  const cost = E.buildingUpgradeInfo(s, "iron-mine").cost;
  const quick = E.cancelBuilding(started, "iron-mine", 30_000);
  for (const r of C.RESOURCE_IDS) expect(quick.resources[r]).toBe(s.resources[r]);
  expect(quick.queue.length).toBe(0);
  const late = E.cancelBuilding(started, "iron-mine", 120_000);
  for (const r of C.RESOURCE_IDS) expect(late.resources[r]).toBe(s.resources[r] - cost[r] + Math.floor(cost[r] * 0.8));
  expect(() => E.cancelBuilding(s, "iron-mine", 0)).toThrow("Nothing is being built");
});

test("the last few minutes of a job can be finished for free (longer with Plus)", () => {
  const s = rich();
  s.buildings["town-hall"] = 20;
  s.buildings.arsenal = 12;
  s.buildings["resource-warehouse"] = 20;
  const started = E.upgradeBuilding(s, "arsenal", 0);
  const end = started.queue[0].endsAt;
  expect(() => E.finishBuilding(started, "arsenal", end - 10 * 60_000)).toThrow("last 5 minutes");
  const done = E.finishBuilding(started, "arsenal", end - 4 * 60_000);
  expect(done.buildings.arsenal).toBe(13);
  expect(done.queue.length).toBe(0);
  const plus = { ...started, plus: { until: Infinity, trialUsed: true, paid: true } };
  expect(E.finishBuilding(plus, "arsenal", end - 14 * 60_000).buildings.arsenal).toBe(13);
});

// ─── Outposts ─────────────────────────────────────────────────────────────────

test("outposts: the Town Hall allows them, they cost resources and settlers, and their fields feed home", () => {
  let s = rich();
  s.buildings["resource-warehouse"] = 20;
  s.population = 5000;
  expect(E.outpostSlots(s)).toBe(0);
  expect(E.outpostBlocked(s)).toContain("Town Hall 10");
  s.buildings["town-hall"] = 10;
  expect(E.outpostSlots(s)).toBe(1);
  const before = E.getRates(s).productionPerHour.iron;
  s = E.foundOutpost(s, { x: 5, y: 5 }, 0);
  expect(s.outposts.length).toBe(1);
  expect(s.population).toBe(5000 - C.OUTPOST.foundPeople);
  expect(E.outpostBlocked(s)).toContain("Town Hall 15");
  // The second costs more.
  s.buildings["town-hall"] = 15;
  expect(E.outpostCost(s).resources.iron).toBe(C.OUTPOST.foundResources * C.OUTPOST.foundGrowth);

  s = E.upgradeField(s, 0, "iron", 0);
  expect(() => E.upgradeField(s, 0, "wood", 0)).toThrow("builder is busy"); // one builder per outpost
  s = E.advance(s, s.outposts[0].job!.endsAt + 1);
  expect(s.outposts[0].fields.iron).toBe(1);
  expect(s.outposts[0].job).toBeUndefined();
  // A level-1 field, like a level-1 mine, with the land's bonus if the land favours iron.
  const land = s.outposts[0].land;
  expect(land).toEqual(outpostLand(5, 5));
  expect(E.getRates(s).productionPerHour.iron).toBeCloseTo(before + 60 * (land.resource === "iron" ? 1 + land.percent / 100 : 1), 5);

  s.outposts[0].fields.iron = C.OUTPOST.fieldMaxLevel;
  expect(() => E.upgradeField(s, 0, "iron", 0)).toThrow("Max level");
  expect(() => E.upgradeField(s, 3, "iron", 0)).toThrow(E.GameError);
  expect(() => E.upgradeField(s, 0, "gold" as C.ResourceId, 0)).toThrow(E.GameError);
});

test("three full outposts add about half a top village's output, not a second village", () => {
  const top = C.productionAt(C.OUTPOST.fieldYield, 20);
  const outposts = 3 * C.productionAt(C.OUTPOST.fieldYield, C.OUTPOST.fieldMaxLevel);
  expect(outposts / top).toBeGreaterThan(0.4);
  expect(outposts / top).toBeLessThan(0.8);
});

test("an outpost's land favours one resource, and that field yields more", () => {
  let s = rich();
  s.buildings["resource-warehouse"] = 20;
  s.buildings["town-hall"] = 10;
  s.population = 5000;
  s = E.foundOutpost(s, { x: 5, y: 5 }, 0);
  s.outposts[0].land = { resource: "wood", percent: 30 };
  s.outposts[0].fields = { iron: 4, wood: 4, clay: 4, crop: 4 };
  const out = E.outpostOutput(s.outposts[0]);
  expect(out.wood).toBeCloseTo(out.iron * 1.3, 5);
  expect(out.clay).toBeCloseTo(out.iron, 5);

  // Old saves get their land from their tile.
  const { land: _land, ...old } = s.outposts[0];
  const loaded = E.normalizeState({ ...s, outposts: [old as E.Outpost] });
  expect(loaded.outposts[0].land).toEqual(outpostLand(5, 5));
});

test("land bonus: the most common land round the tile wins, capped", () => {
  const woods = () => "forest" as const;
  expect(outpostLand(0, 0, woods)).toEqual({ resource: "wood", percent: C.OUTPOST.landBonusMax });
  // 3 hills, 3 forest, 3 plains, own tile hills: the own tile breaks the tie.
  const mixed = (x: number) => (x === 0 ? "hills" : x === 1 ? "forest" : "plains") as "hills" | "forest" | "plains";
  expect(outpostLand(0, 0, (x) => mixed(x))).toEqual({ resource: "clay", percent: 3 * C.OUTPOST.landBonusPerTile });
  // Water by an outpost feeds it fish: crop.
  expect(outpostLand(0, 0, (x, y) => (x === 0 && y === 0 ? "plains" : "lake")).resource).toBe("crop");
});

test("spots offered: the best land for each resource, nearest first", () => {
  const at = (x: number) => (x < 3 ? "forest" : x < 6 ? "hills" : "plains") as "forest" | "hills" | "plains";
  const cands = Array.from({ length: 9 }, (_, x) => ({ x, y: 0 }));
  const spots = outpostSpots({ x: 0, y: 0 }, cands, (x) => at(x));
  expect(new Set(spots.map((p) => p.land.resource)).size).toBe(spots.length); // one per resource
  expect(spots.map((p) => p.land.resource).sort()).toEqual(["clay", "crop", "wood"]);
  for (let i = 1; i < spots.length; i++) expect(spots[i].distance).toBeGreaterThanOrEqual(spots[i - 1].distance);
  expect(spots.length).toBeLessThanOrEqual(C.OUTPOST.spotChoices);
});

test("three full outposts stay under a top village even if all favour the same resource", () => {
  const top = C.productionAt(C.OUTPOST.fieldYield, 20);
  const best = 3 * C.productionAt(C.OUTPOST.fieldYield, C.OUTPOST.fieldMaxLevel) * (1 + C.OUTPOST.landBonusMax / 100);
  expect(best / top).toBeLessThan(0.9);
});

