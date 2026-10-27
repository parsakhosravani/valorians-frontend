import { expect, test } from "bun:test";

import * as E from "./engine";
import * as W from "./war";
import { REDIRECT } from "./config";

const T0 = Date.UTC(2026, 9, 27, 10);
const army = (a: Partial<E.Army>): E.Army => ({ ...E.emptyArmy(), ...a });
const loot = (n: number): W.Loot => ({ iron: n, wood: n, clay: n, crop: n });

test("new orders can shrink an army, never grow it", () => {
  const cur = army({ spearman: 10, axeman: 5 });
  const { go, back } = W.splitForRedirect(cur, army({ spearman: 6, axeman: 5 }), { go: false, back: false });

  expect(go.spearman).toBe(6);
  expect(back.spearman).toBe(4);
  expect(back.axeman).toBe(0);
  expect(() => W.splitForRedirect(cur, army({ spearman: 11 }), { go: false, back: false })).toThrow("can't add troops");
  expect(() => W.splitForRedirect(cur, army({ cavalry: 1, spearman: 1 }), { go: false, back: false })).toThrow("no Light Cavalry");
  expect(() => W.splitForRedirect(cur, army({}), { go: false, back: false })).toThrow("Choose some troops");
});

test("longships go with whichever group crosses the sea; spares sail home", () => {
  const cur = army({ spearman: 60, longship: 5 }); // 60 foot = 3 ships of 20 slots
  const sea = W.splitForRedirect(cur, army({ spearman: 40 }), { go: true, back: false });

  expect(sea.go.longship).toBe(2);
  expect(sea.back.longship).toBe(3);

  const land = W.splitForRedirect(cur, army({ spearman: 40 }), { go: false, back: false });
  expect(land.go.longship).toBe(0);
  expect(land.back.longship).toBe(5);

  expect(() => W.splitForRedirect(army({ spearman: 60, longship: 2 }), army({ spearman: 60 }), { go: true, back: false })).toThrow(
    "Longships needed"
  );
});

test("supplies are a share of the training cost plus crop for the road", () => {
  const units = army({ spearman: 100 }); // 25/45/20/15 each, eats 1 crop/h
  const s = W.redirectSupply(units, 2 * 3_600_000);

  expect(s.iron).toBe(Math.ceil(25 * 100 * REDIRECT.supplyShare));
  expect(s.wood).toBe(Math.ceil(45 * 100 * REDIRECT.supplyShare));
  expect(s.crop).toBe(Math.ceil(15 * 100 * REDIRECT.supplyShare + 100 * 2));
});

test("supplies come out of the loot first, the rest is owed by home", () => {
  const { loot: left, owed } = W.payFromLoot({ iron: 100, wood: 10, clay: 0, crop: 500 }, loot(50));

  expect(left).toEqual({ iron: 50, wood: 0, clay: 0, crop: 450 });
  expect(owed).toEqual({ iron: 0, wood: 40, clay: 50, crop: 0 });

  const s = E.createInitialState(T0);
  const after = W.paySupplyFromHome(s, owed);
  expect(after.resources.wood).toBe(s.resources.wood - 40);
  s.resources.clay = 10;
  expect(() => W.paySupplyFromHome(s, owed)).toThrow("Supplies");
});

test("troops sent home take their carrying share of the spoils", () => {
  const go = army({ spearman: 30 }); // carry 750
  const back = army({ spearman: 10 }); // carry 250
  const r = W.splitSpoils(loot(400), 100, go, back);

  expect(r.back.iron).toBe(100);
  expect(r.go.iron).toBe(300);
  expect(r.backCoins).toBe(25);
  expect(r.goCoins).toBe(75);

  const none = W.splitSpoils(loot(400), 100, go, E.emptyArmy());
  expect(none.go.iron).toBe(400);
  expect(none.backCoins).toBe(0);
});

test("one new order per expedition, more with the War Orders card", () => {
  let s = E.createInitialState(T0);

  expect(W.maxOrders(s)).toBe(1);
  expect(() => W.checkOrdersLeft(s, 0)).not.toThrow();
  expect(() => W.checkOrdersLeft(s, 1)).toThrow("War Orders card");
  s.coins = 100_000;
  s = W.buyOrdersCard(s);
  expect(s.cards.orders).toBe(1);
  expect(s.coins).toBe(100_000 - REDIRECT.cardCost[0]);
  expect(W.maxOrders(s)).toBe(2);
  expect(() => W.checkOrdersLeft(s, 1)).not.toThrow();
  for (let i = 1; i < REDIRECT.maxCardLevel; i++) s = W.buyOrdersCard(s);
  expect(W.ordersCardCost(s)).toBe(null);
  expect(() => W.buyOrdersCard(s)).toThrow("highest level");
  s.coins = 0;
  expect(() => W.buyOrdersCard({ ...E.createInitialState(T0), coins: 0 })).toThrow("coins");
});

test("old saves get an empty card", () => {
  const { cards: _c, ...old } = E.createInitialState(T0);
  const s = E.normalizeState(old as E.GameState);

  expect(s.cards.orders).toBe(0);
});

test("a winner brings home the spoils it carried plus new loot, up to what it can carry", () => {
  const defender = E.createInitialState(T0);
  defender.shieldUntil = 0;
  defender.resources = loot(10_000);
  const attacker = E.createInitialState(T0);
  const sent = army({ axeman: 100 }); // carry 4500, overwhelming attack
  const carried = loot(500); // 2000 already on their backs

  const r = W.defendRaid(defender, attacker, sent, T0, 0.5, { carried, carriedCoins: 40 });

  expect(r.report.attackerWon).toBe(true);
  const newLoot = Object.values(r.report.loot).reduce((a, b) => a + b, 0);
  expect(newLoot).toBeLessThanOrEqual(4500 - 2000 + 4); // room left after the carried spoils
  expect(newLoot).toBeGreaterThan(2000);

  const home = W.receiveRaidReport(attacker, r.report, "Them", T0, 0.3, { x: 1, y: 1 }, 1);
  const m = home.marches[0];
  expect(m.loot.iron).toBe(r.report.loot.iron + 500);
  expect(m.coins).toBe(40);
  expect(m.hops).toBe(1);
});

test("a beaten army drops the spoils it carried", () => {
  const defender = E.createInitialState(T0);
  defender.shieldUntil = 0;
  defender.army.spearman = 500;
  const attacker = E.createInitialState(T0);
  const sent = army({ spearman: 5 });
  const r = W.defendRaid(defender, attacker, sent, T0, 0.5, { carried: loot(100), carriedCoins: 10 });

  expect(r.report.attackerWon).toBe(false);
  const home = W.receiveRaidReport(attacker, r.report, "Them", T0, 0.3);
  const total = home.marches.reduce((a, m) => a + m.loot.iron + m.coins, 0);
  expect(total).toBe(0);
});

test("a camp won after new orders adds the carried spoils to the reward", () => {
  const s = E.createInitialState(T0);
  const sent = army({ axeman: 50 });
  const r = W.campBattle(s, 1, sent, T0, 0.5, { carried: loot(200), carriedCoins: 5, hops: 1 });

  expect(r.report.attackerWon).toBe(true);
  const m = r.state.marches[0];
  expect(m.loot.wood).toBe(r.report.loot.wood + 200);
  expect(m.coins).toBe(r.report.coins + 5);
  expect(m.hops).toBe(1);
});

test("troops turned back keep the spoils they carry", () => {
  const s = W.returnHome(E.createInitialState(T0), army({ spearman: 3 }), "x", T0 + 1000, T0, 0.1, undefined, T0, {
    loot: { iron: 7 },
    coins: 2,
    hops: 1,
  });

  expect(s.marches[0].loot).toEqual({ iron: 7, wood: 0, clay: 0, crop: 0 });
  expect(s.marches[0].coins).toBe(2);
  const back = E.advance(s, T0 + 2000);
  expect(back.coins).toBeGreaterThanOrEqual(s.coins + 2);
});
