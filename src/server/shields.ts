import "server-only";

import { getDb } from "./db";
import { findById, mutatePlayer } from "./players";
import { appUrl, tg } from "./bot";
import type { PreCheckoutQuery, SuccessfulPayment } from "./plus";

import { SHIELDS, ShieldId, shieldOption } from "@/lib/game/config";
import { GameError, advance, breakShield, raiseShield, shieldBlocked } from "@/lib/game/engine";

/**
 * Shields sold for Telegram Stars, one-time payments (not subscriptions).
 *
 * The invoice payload is `shield:<userId>:<optionId>`. The pre-checkout check
 * refuses a shield the player couldn't raise right now (cooldown, or already
 * shielded for longer), so they're never charged for nothing. If the shield
 * still can't go up when the payment lands, the Stars are refunded at once.
 */

const payloadFor = (userId: number, id: ShieldId) => `shield:${userId}:${id}`;

export const parseShieldPayload = (payload: string | undefined) => {
  const m = /^shield:(\d+):([\w]+)$/.exec(payload ?? "");
  const option = m ? shieldOption(m[2]) : null;

  return m && option ? { userId: Number(m[1]), option } : null;
};

const hoursLabel = (h: number) => (h % 24 === 0 && h > 24 ? `${h / 24} days` : `${h} hours`);

export async function createShieldInvoice(userId: number, id: unknown): Promise<string> {
  const option = shieldOption(id);

  if (!option) throw new GameError("Unknown shield", "bad_request");
  const p = await findById(userId);
  const now = Date.now();
  const blocked = p ? shieldBlocked(advance(p.state, now), option.hours, now) : "Player not found";

  if (blocked) throw new GameError(blocked, "shield_unavailable");
  const r = await tg("createInvoiceLink", {
    title: `🛡️ Shield · ${hoursLabel(option.hours)}`,
    description: `No one can attack your tribe for ${hoursLabel(option.hours)}. Attacking someone yourself breaks the shield.`,
    payload: payloadFor(userId, option.id),
    currency: "XTR",
    prices: [{ label: `Shield · ${hoursLabel(option.hours)}`, amount: option.stars }],
    photo_url: `${appUrl()}/bot/welcome-v2.jpg`,
  });

  if (!r.ok || typeof r.result !== "string") {
    // eslint-disable-next-line no-console
    console.error("createInvoiceLink (shield) failed", r.description);
    throw new GameError("Payments are unavailable right now, try again later", "payments_unavailable");
  }

  return r.result;
}

/** The answer for a shield checkout: null to accept, or why it's refused. */
export async function checkShieldCheckout(q: PreCheckoutQuery): Promise<string | null> {
  const parsed = parseShieldPayload(q.invoice_payload);

  if (!parsed || parsed.userId !== q.from.id || q.currency !== "XTR" || q.total_amount !== parsed.option.stars) {
    return "This offer has changed. Please reopen the shield in the game and try again.";
  }
  const p = await findById(parsed.userId);
  const now = Date.now();

  return p ? shieldBlocked(advance(p.state, now), parsed.option.hours, now) : "Player not found";
}

/** Raises a paid shield, or refunds the Stars if it can't go up anymore. Returns false if already counted. */
export async function recordShieldPayment(payerId: number, p: SuccessfulPayment, now = Date.now()) {
  const parsed = parseShieldPayload(p.invoice_payload);

  if (!parsed || p.currency !== "XTR") return false;
  const userId = parsed.userId;
  const db = await getDb();
  const ins = await db.execute({
    sql: `INSERT INTO payments (charge_id, user_id, product, stars, recurring, expires_at, created_at)
          VALUES (?, ?, ?, ?, 0, NULL, ?) ON CONFLICT(charge_id) DO NOTHING`,
    args: [p.telegram_payment_charge_id, userId, `shield:${parsed.option.id}`, p.total_amount, now],
  });

  if (ins.rowsAffected !== 1) return false;

  try {
    await mutatePlayer(userId, now, (s) => raiseShield(s, parsed.option.hours, now));
  } catch (e) {
    // Mark it refunded first, so Telegram's refunded_payment update is a no-op.
    await db.execute({ sql: "UPDATE payments SET refunded_at = ? WHERE charge_id = ?", args: [now, p.telegram_payment_charge_id] });
    await tg("refundStarPayment", { user_id: payerId, telegram_payment_charge_id: p.telegram_payment_charge_id });
    await tg("sendMessage", {
      chat_id: userId,
      text: `🛡️ Your shield couldn't be raised (${e instanceof GameError ? e.message : "something went wrong"}). Your ${p.total_amount} Stars were refunded.`,
    });

    return true;
  }

  await tg("sendMessage", {
    chat_id: userId,
    parse_mode: "HTML",
    text:
      `🛡️ <b>Shield raised for ${hoursLabel(parsed.option.hours)}.</b>\n\n` +
      `No one can attack your tribe until it ends. Sending an army against another tribe breaks it, ` +
      `and after a shield ends the next one needs ${Math.round(SHIELDS.cooldownMs / 3600e3)}h to recharge.`,
    reply_markup: { inline_keyboard: [[{ text: "⚔️ Back to my tribe", web_app: { url: `${appUrl()}/hall` } }]] },
  });

  return true;
}

/** A shield refunded from outside the game (e.g. by hand) drops right away. */
export async function endRefundedShield(userId: number, now = Date.now()) {
  await mutatePlayer(userId, now, (s0) => {
    const s = { ...s0, shield: { ...s0.shield } };

    breakShield(s, now);

    return s;
  });
}
