import { test, expect } from "bun:test";
import crypto from "crypto";
import * as E from "./engine";
import * as C from "./config";
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
  expect(s.resources.wood).toBe(2000 - 150);
  expect(() => E.upgradeBuilding(s, "sawmill", T0)).toThrow("All builders are busy");
  s = E.advance(s, T0 + 10_000 + 3600e3);
  expect(s.buildings["iron-mine"]).toBe(1);
  expect(s.queue.length).toBe(0);
  // ~1h at 160/h after the 10s build
  expect(Math.round(s.resources.iron)).toBe(Math.round(1850 + 100 * 10/3600 + 160));
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
  for (const lvl of [5, 10, 15, 20]) {
    const cost = C.buildingUpgradeCost(b, lvl) * 4;
    const gain = C.productionAt(60, lvl + 1) - C.productionAt(60, lvl);
    expect(cost / gain / 24).toBeLessThan(6); // days to pay back
  }
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
