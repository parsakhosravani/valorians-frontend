import { expect, test } from "bun:test";

import * as E from "./engine";
import * as Tr from "./trade";
import * as C from "./config";
import { guardCost } from "./config";

const T0 = Date.UTC(2026, 9, 25, 10);
const withPost = (lvl = 1) => {
  const s = E.createInitialState(T0);

  s.buildings[Tr.TRADING_POST] = lvl;
  s.resources = { iron: 5000, wood: 5000, clay: 5000, crop: 5000 };

  return s;
};
const offer = (o: Partial<Tr.Offer> = {}): Tr.Offer => ({
  give: "wood",
  giveAmount: 500,
  want: "iron",
  wantAmount: 400,
  ...o,
});

test("offers are validated", () => {
  expect(
    Tr.parseOffer({
      give: "wood",
      giveAmount: "500.7",
      want: "iron",
      wantAmount: 400,
    }),
  ).toEqual(offer());
  expect(() => Tr.parseOffer(offer({ want: "wood" }))).toThrow("different");
  expect(() => Tr.parseOffer(offer({ giveAmount: 10 }))).toThrow("at least");
  expect(() => Tr.parseOffer(offer({ wantAmount: 1100 }))).toThrow(
    "half and double",
  );
  expect(() => Tr.parseOffer(offer({ wantAmount: 250 }))).not.toThrow();
  expect(() =>
    Tr.parseOffer({
      give: "gold",
      giveAmount: 100,
      want: "iron",
      wantAmount: 100,
    }),
  ).toThrow();
});

test("posting needs a Trading Post, a free merchant and the goods; it locks them", () => {
  expect(() => Tr.postOffer(withPost(0), offer(), 0)).toThrow("Trading Post");
  const s = Tr.postOffer(withPost(1), offer(), 0);

  expect(s.resources.wood).toBe(4500);
  expect(() => Tr.postOffer(withPost(1), offer(), 1)).toThrow("busy");
  expect(() =>
    Tr.postOffer(withPost(1), offer({ giveAmount: 1500, wantAmount: 1500 }), 0),
  ).toThrow("carry up to 1,000");
  expect(
    Tr.postOffer(withPost(2), offer({ giveAmount: 1500, wantAmount: 1500 }), 1)
      .resources.wood,
  ).toBe(3500);
  const poor = withPost(3);

  poor.resources.wood = 100;
  expect(() => Tr.postOffer(poor, offer(), 0)).toThrow("Not enough");
});

test("accepting pays the price; goods arrive capped by storage", () => {
  const buyer = Tr.payForOffer(withPost(1), offer());

  expect(buyer.resources.iron).toBe(4600);
  expect(() => Tr.payForOffer(withPost(0), offer())).toThrow("Trading Post");
  const cap = E.getRates(buyer).capacity;
  const got = Tr.receiveGoods(buyer, "wood", 500);

  expect(got.resources.wood).toBe(Math.min(cap, 5500));
  const full = withPost(1);

  full.resources.wood = cap;
  expect(Tr.receiveGoods(full, "wood", 500).resources.wood).toBe(cap);
});

test("merchants take time to travel", () => {
  expect(Tr.tradeTravelMs(0)).toBe(30_000);
  expect(Tr.tradeTravelMs(10)).toBe(150_000);
});

test("guards cost coins for the load they escort, and the pay comes back on cancel", () => {
  const s0 = E.createInitialState(T0);

  s0.coins = 100;
  const s = Tr.hireGuards(s0, 1000);

  expect(s.coins).toBe(100 - guardCost(1000));
  expect(guardCost(1000)).toBe(40);
  expect(guardCost(50)).toBe(10);
  expect(Tr.refundGuards(s, 1000).coins).toBe(100);
  s0.coins = 5;
  expect(() => Tr.hireGuards(s0, 1000)).toThrow("Guards cost 40 coins");
});

test("merchant loads grow with the Trading Post so the late market can move real amounts", () => {
  expect(Tr.merchantLoad(0)).toBe(0);
  expect(Tr.merchantLoad(1)).toBe(Tr.MERCHANT_CARRY);
  expect(Tr.merchantLoad(10)).toBeGreaterThan(10 * Tr.MERCHANT_CARRY);
  expect(Tr.merchantLoad(20)).toBeGreaterThan(90_000);
  const s = E.createInitialState(0);
  s.buildings["trading-post"] = 20;
  expect(Tr.tradeLimits(s)).toMatchObject({ maxOffers: 20, maxAmount: Tr.merchantLoad(20) });
});

test("the Merchant of the North swaps at once, always at a loss, and never overfills", () => {
  const s = E.createInitialState(0);
  expect(() => Tr.exchange(s, "iron", "wood", 1000)).toThrow("Trading Post");
  s.buildings["trading-post"] = 3;
  const out = Tr.exchange(s, "iron", "wood", 1000);
  expect(out.resources.iron).toBe(s.resources.iron - 1000);
  expect(out.resources.wood).toBe(s.resources.wood + Tr.exchangeReturn(1000));
  expect(Tr.exchangeReturn(1000)).toBeLessThan(1000);
  // Junk and impossible swaps are refused.
  for (const bad of [NaN, -5, 0, 10, "x", Infinity]) expect(() => Tr.exchange(s, "iron", "wood", bad)).toThrow(E.GameError);
  expect(() => Tr.exchange(s, "iron", "iron", 1000)).toThrow(E.GameError);
  expect(() => Tr.exchange(s, "gold", "iron", 1000)).toThrow(E.GameError);
  expect(() => Tr.exchange(s, "iron", "wood", Tr.merchantLoad(3) + 1)).toThrow(E.GameError);
  const full = { ...s, resources: { ...s.resources, wood: E.getRates(s).capacity } };
  expect(() => Tr.exchange(full, "iron", "wood", 1000)).toThrow("room");
  // Swapping round and round only ever loses.
  let t = s;
  for (let i = 0; i < 5; i++) t = Tr.exchange(Tr.exchange(t, "iron", "wood", 500), "wood", "iron", 300);
  const total = (x: typeof s) => C.RESOURCE_IDS.reduce((a, r) => a + x.resources[r], 0);
  expect(total(t)).toBeLessThan(total(s));
});

test("each Trading Post level is one merchant, busy on the market or on the road", () => {
  const s = E.createInitialState(Date.now());

  s.buildings["trading-post"] = 2;
  for (const r of ["iron", "wood", "clay", "crop"] as const) s.resources[r] = 10_000;
  const o = { give: "iron" as const, giveAmount: 500, want: "clay" as const, wantAmount: 500 };

  // Two merchants: with one out, one more offer or purchase; with both out, none.
  expect(() => Tr.postOffer(s, o, 1)).not.toThrow();
  expect(() => Tr.payForOffer(s, o, 1)).not.toThrow();
  expect(() => Tr.postOffer(s, o, 2)).toThrow(/merchants are busy/);
  expect(() => Tr.payForOffer(s, o, 2)).toThrow(/merchants are busy/);
});
