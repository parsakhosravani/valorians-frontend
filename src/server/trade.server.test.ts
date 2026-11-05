import "@/server/testing/harness";
import crypto from "crypto";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { newPlayer, reload } from "@/server/testing/harness";
import { getDb } from "@/server/db";
import { acceptTrade, postTrade, resolveDueTrades } from "@/server/trade";
import { mutatePlayer } from "@/server/players";

const merchant = (now: number) =>
  newPlayer(now, (s) => {
    s.buildings["trading-post"] = 3;
  });

/** Posts "500 iron for 500 clay" and returns the trade's id. */
async function offer(now: number) {
  const seller = await merchant(now);

  await postTrade(seller, { give: "iron", giveAmount: 500, want: "clay", wantAmount: 500 }, now);
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT id FROM trades WHERE seller_id = ? AND status = 'open'", args: [seller.id] });

  return { seller, id: Number(rs.rows[0].id) };
}

async function trade(id: number) {
  const db = await getDb();

  return (await db.execute({ sql: "SELECT * FROM trades WHERE id = ?", args: [id] })).rows[0];
}

/** The player's resources as of `at` (production included), to compare like with like. */
const resourcesAt = async (id: number, at: number) => (await mutatePlayer(id, at, (s) => s)).state.resources;

/**
 * These tests are about delivery, not bandits: when the merchants' road
 * passes a manned lair (it depends on where the test tribes happened to
 * settle), a robbery could take part of a load and fail them at random.
 * Here the robbery roll always comes up "no robbery".
 */
const noBandits = () => spyOn(crypto, "randomInt").mockImplementation((() => 999_999) as never);

describe("market trades (server)", () => {
  afterEach(() => mock.restore());

  test("two buyers at once: one gets the offer, the other is paid back", async () => {
    const T0 = Date.now();
    const { id } = await offer(T0);
    const [a, b] = [await merchant(T0), await merchant(T0)];
    const results = await Promise.allSettled([acceptTrade(a, id, T0), acceptTrade(b, id, T0)]);

    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)).toContain("took that offer");
    const winner = results[0].status === "fulfilled" ? a : b;
    const loser = winner === a ? b : a;

    expect(Number((await trade(id)).buyer_id)).toBe(winner.id);
    // The loser's clay came back: they have the same as a merchant who never tried.
    const control = await merchant(T0);

    expect((await resourcesAt(loser.id, T0 + 1)).clay).toBeCloseTo((await resourcesAt(control.id, T0 + 1)).clay, 5);
  });

  test("goods are delivered once, however many requests resolve it", async () => {
    noBandits();

    const T0 = Date.now();
    const { seller, id } = await offer(T0);
    const buyer = await merchant(T0);

    await acceptTrade(buyer, id, T0);
    const at = Number((await trade(id)).arrives_at) + 1;
    const sellerBefore = await resourcesAt(seller.id, at);
    const buyerBefore = await resourcesAt(buyer.id, at);

    await Promise.all([resolveDueTrades(at), resolveDueTrades(at), resolveDueTrades(at, seller.id), resolveDueTrades(at, buyer.id)]);
    await resolveDueTrades(at + 1000);

    expect(String((await trade(id)).status)).toBe("delivered");
    expect((await reload(seller.id)).state.resources.clay - sellerBefore.clay).toBeCloseTo(500, 0);
    expect((await reload(buyer.id)).state.resources.iron - buyerBefore.iron).toBeCloseTo(500, 0);
  });

  test("if the buyer's delivery fails, retrying never pays the seller twice", async () => {
    noBandits();

    const T0 = Date.now();
    const { seller, id } = await offer(T0);
    const buyer = await merchant(T0);

    await acceptTrade(buyer, id, T0);
    const at = Number((await trade(id)).arrives_at) + 1;
    const sellerBefore = await resourcesAt(seller.id, at);
    const db = await getDb();
    // The buyer's side can't be saved (here: their row is gone; in real life a DB error).
    const saved = (await db.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [buyer.id] })).rows[0];

    await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [buyer.id] });
    const quiet = spyOn(console, "error").mockImplementation(() => {}); // the failures are expected here

    await resolveDueTrades(at);
    await resolveDueTrades(at);
    await resolveDueTrades(at);
    quiet.mockRestore();

    expect((await reload(seller.id)).state.resources.clay - sellerBefore.clay).toBeCloseTo(500, 0);

    // Once the buyer can be saved again, they get their goods too, and it's done.
    const cols = Object.keys(saved);

    await db.execute({
      sql: `INSERT INTO users (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      args: cols.map((c) => saved[c] as any),
    });
    await resolveDueTrades(at);
    expect(String((await trade(id)).status)).toBe("delivered");
    expect((await reload(seller.id)).state.resources.clay - sellerBefore.clay).toBeCloseTo(500, 0);
  });

  test("merchants stay busy while their loads are on the road, for buyer and seller", async () => {
    noBandits();
    const T0 = Date.now();
    // A Trading Post of 1: one merchant each.
    const buyer = await newPlayer(T0, (s) => { s.buildings["trading-post"] = 1; });
    const { seller, id } = await offer(T0);
    const { id: second } = await offer(T0);

    await acceptTrade(buyer, id, T0);
    // The buyer's only merchant is on the road with the payment: no second purchase.
    await expect(acceptTrade(await reload(buyer.id), second, T0 + 1)).rejects.toThrow(/merchants are busy/);
    // The seller's merchant is on the road too (Trading Post 3: 2 of 3 still free).
    const db = await getDb();
    const road = await db.execute({
      sql: "SELECT COUNT(*) AS n FROM trades WHERE (seller_id = ? OR buyer_id = ?) AND status = 'accepted'",
      args: [seller.id, seller.id],
    });

    expect(Number(road.rows[0].n)).toBe(1);
    // Delivered: the merchant is home and can carry again.
    const arrives = Number((await trade(id)).arrives_at);

    await resolveDueTrades(arrives + 1);
    await acceptTrade(await reload(buyer.id), second, arrives + 2);
    expect(Number((await trade(second)).buyer_id)).toBe(buyer.id);
  });
});
