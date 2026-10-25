import { expect, test } from "bun:test";

import * as E from "./engine";
import * as Tr from "./trade";

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
