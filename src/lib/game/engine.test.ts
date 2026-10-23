import { test, expect } from "bun:test";
import crypto from "crypto";
import * as E from "./engine";
import { verifyInitData } from "../../server/auth";

const T0 = Date.UTC(2026, 9, 23, 10);
test("energy regen and production", () => {
  let s = E.createInitialState(T0);
  s.energy = 0;
  s = E.advance(s, T0 + 30 * 60e3);
  const r = E.getRates(s);
  expect(Math.round(s.energy)).toBe(Math.round(r.energyCapacity / 2));
  expect(Math.round(s.resources.iron)).toBe(2050);
  expect(Math.round(s.coins)).toBe(1005);
});
test("taps rate limited, energy limited, capacity limited", () => {
  let s = E.createInitialState(T0);
  const r1 = E.applyTaps(s, "iron", 1000, T0 + 1000);
  expect(r1.accepted).toBe(60); // 20/s *1 + 40 burst
  expect(r1.state.resources.iron).toBe(2000 + 600);
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
test("full energy limits", () => {
  let s = E.createInitialState(T0); s.energy = 0;
  s = E.refillEnergy(s, T0);
  s.energy = 0;
  expect(() => E.refillEnergy(s, T0 + 1000)).toThrow("cooling down");
  s = E.refillEnergy(s, T0 + 3600e3); s.energy = 0;
  s = E.refillEnergy(s, T0 + 7200e3); s.energy = 0;
  expect(() => E.refillEnergy(s, T0 + 3 * 3600e3)).toThrow("No full energy");
  s = E.advance(s, T0 + 24 * 3600e3); s.energy = 0;
  s = E.refillEnergy(s, T0 + 24 * 3600e3);
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
