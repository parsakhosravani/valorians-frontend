import "@/server/testing/harness";
import { describe, expect, test } from "bun:test";

import { newPlayer, reload } from "@/server/testing/harness";
import { recordPayment, recordRefund } from "@/server/plus";

const DAY = 24 * 3600e3;

const payment = (userId: number, chargeId: string, expiresAt: number) => ({
  currency: "XTR",
  total_amount: 150,
  invoice_payload: `plus:${userId}`,
  telegram_payment_charge_id: chargeId,
  subscription_expiration_date: Math.floor(expiresAt / 1000),
  is_recurring: true,
  is_first_recurring: true,
});

describe("Valorians Plus payments (server)", () => {
  test("a payment Telegram sends twice counts once", async () => {
    const T0 = Date.now();
    const p = await newPlayer(T0);
    const pay = payment(p.id, `charge-${p.id}`, T0 + 30 * DAY);

    expect(await recordPayment(p.id, pay, T0)).toBe(true);
    const until = (await reload(p.id)).state.plus.until;

    expect(until).toBeGreaterThan(T0 + 29 * DAY);
    // Telegram retries updates it thinks weren't received.
    expect(await recordPayment(p.id, pay, T0 + 1000)).toBe(false);
    expect((await reload(p.id)).state.plus.until).toBe(until);
  });

  test("the same payment arriving in parallel still counts once", async () => {
    const T0 = Date.now();
    const p = await newPlayer(T0);
    const pay = payment(p.id, `charge-par-${p.id}`, T0 + 30 * DAY);
    const counted = await Promise.all([recordPayment(p.id, pay, T0), recordPayment(p.id, pay, T0), recordPayment(p.id, pay, T0)]);

    expect(counted.filter(Boolean).length).toBe(1);
  });

  test("a refund ends Plus right away, and only once", async () => {
    const T0 = Date.now();
    const p = await newPlayer(T0);
    const pay = payment(p.id, `charge-ref-${p.id}`, T0 + 30 * DAY);

    await recordPayment(p.id, pay, T0);
    await recordRefund(p.id, pay, T0 + DAY);
    const s = (await reload(p.id)).state;

    expect(s.plus.until).toBeLessThanOrEqual(T0 + DAY);
    expect(s.plus.paid).toBe(false);
    // A repeated refund update changes nothing.
    await recordRefund(p.id, pay, T0 + 2 * DAY);
    expect((await reload(p.id)).state.plus.until).toBe(s.plus.until);
  });

  test("other currencies are ignored", async () => {
    const T0 = Date.now();
    const p = await newPlayer(T0);

    expect(await recordPayment(p.id, { ...payment(p.id, `usd-${p.id}`, T0 + 30 * DAY), currency: "USD" }, T0)).toBe(false);
    expect((await reload(p.id)).state.plus.until).toBeLessThanOrEqual(T0);
  });
});
