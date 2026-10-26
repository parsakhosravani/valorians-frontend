import "server-only";

import { getDb } from "./db";
import { mutatePlayer } from "./players";
import { appUrl, tg } from "./bot";
import { checkShieldCheckout, endRefundedShield, parseShieldPayload, recordShieldPayment } from "./shields";

import { PLUS } from "@/lib/game/config";
import { GameError, grantPlus } from "@/lib/game/engine";

/**
 * Valorians Plus, a monthly subscription paid in Telegram Stars (currency XTR).
 *
 * 1. The app asks /api/plus/invoice for a subscription invoice link and opens
 *    it with Telegram.WebApp.openInvoice.
 * 2. Telegram sends the bot a pre_checkout_query; we check it and say yes.
 * 3. Telegram sends a successful_payment message, the first time and on every
 *    monthly renewal. Each one is stored by its charge id (so a repeated
 *    update never counts twice) and Plus is extended to the renewal date.
 *
 * Players cancel from Telegram's own subscription settings; Plus then simply
 * runs out at the end of the paid month.
 */

/** Monthly price in Stars. Changing it only affects new subscriptions. */
export const plusPrice = () => {
  const n = Math.floor(Number(process.env.PLUS_PRICE_STARS));

  return n >= 1 && n <= 10000 ? n : PLUS.priceStars;
};

const PERIOD_SECONDS = 30 * 24 * 3600; // the only period Telegram accepts
const payloadFor = (userId: number) => `plus:${userId}`;
const userFromPayload = (payload: string | undefined) => {
  const m = /^plus:(\d+)$/.exec(payload ?? "");

  return m ? Number(m[1]) : null;
};

export async function createPlusInvoice(userId: number): Promise<string> {
  const r = await tg("createInvoiceLink", {
    title: "Valorians Plus",
    description: `+1 builder, +2 training slots, a free ${PLUS.weeklyShieldHours}h shield every week and the 👑 Plus crown. Renews monthly, cancel anytime in Telegram.`,
    payload: payloadFor(userId),
    currency: "XTR",
    prices: [{ label: "Valorians Plus · 1 month", amount: plusPrice() }],
    subscription_period: PERIOD_SECONDS,
    photo_url: `${appUrl()}/bot/welcome.jpg`,
  });

  if (!r.ok || typeof r.result !== "string") {
    // eslint-disable-next-line no-console
    console.error("createInvoiceLink failed", r.description);
    throw new GameError("Payments are unavailable right now, try again later", "payments_unavailable");
  }

  return r.result;
}

// ─── Bot updates ─────────────────────────────────────────────────────────────

export type PreCheckoutQuery = {
  id: string;
  from: { id: number };
  currency: string;
  total_amount: number;
  invoice_payload: string;
};

export type SuccessfulPayment = {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  subscription_expiration_date?: number;
  is_recurring?: boolean;
  is_first_recurring?: boolean;
};

export type RefundedPayment = {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
};

/** Telegram waits up to 10 seconds for this answer before the payment fails. */
export async function answerPreCheckout(q: PreCheckoutQuery) {
  let error: string | null;

  if (parseShieldPayload(q.invoice_payload)) {
    error = await checkShieldCheckout(q).catch(() => "Shields are unavailable right now, try again later");
  } else {
    const userId = userFromPayload(q.invoice_payload);
    const ok = userId === q.from.id && q.currency === "XTR" && q.total_amount === plusPrice();

    error = ok ? null : "This offer has changed. Please reopen Plus in the game and try again.";
  }

  await tg("answerPreCheckoutQuery", {
    pre_checkout_query_id: q.id,
    ok: !error,
    ...(error ? { error_message: error } : {}),
  });
}

/** Records a payment (first or renewal) and extends Plus. Returns false if it was already counted. */
export async function recordPayment(payerId: number, p: SuccessfulPayment, now = Date.now()) {
  if (parseShieldPayload(p.invoice_payload)) return recordShieldPayment(payerId, p, now);
  const userId = userFromPayload(p.invoice_payload) ?? payerId;

  if (p.currency !== "XTR") return false;
  const expiresAt = p.subscription_expiration_date ? p.subscription_expiration_date * 1000 : null;
  const db = await getDb();
  const ins = await db.execute({
    sql: `INSERT INTO payments (charge_id, user_id, product, stars, recurring, expires_at, created_at)
          VALUES (?, ?, 'plus', ?, ?, ?, ?) ON CONFLICT(charge_id) DO NOTHING`,
    args: [p.telegram_payment_charge_id, userId, p.total_amount, p.is_recurring && !p.is_first_recurring ? 1 : 0, expiresAt, now],
  });

  if (ins.rowsAffected !== 1) return false;
  await mutatePlayer(userId, now, (s) => grantPlus(s, now, expiresAt ?? undefined));
  const renewal = p.is_recurring && !p.is_first_recurring;

  await tg("sendMessage", {
    chat_id: userId,
    parse_mode: "HTML",
    text: renewal
      ? `👑 <b>Valorians Plus renewed.</b> Thank you for backing the saga, chief!`
      : `👑 <b>Welcome to Valorians Plus!</b>\n\n` +
        `🔨 +${PLUS.extraBuilders} builder\n⚔️ +${PLUS.extraTrainBatches} training slots\n` +
        `🛡️ A free ${PLUS.weeklyShieldHours}h shield every week\n👑 The Plus crown next to your name\n\n` +
        `It renews every month. You can cancel anytime from your Telegram subscription settings.`,
    reply_markup: { inline_keyboard: [[{ text: "⚔️ Back to my tribe", web_app: { url: `${appUrl()}/tribe` } }]] },
  });

  return true;
}

/** A refunded payment (sent by Telegram when the bot refunds Stars) ends Plus, or drops the shield. */
export async function recordRefund(payerId: number, r: RefundedPayment, now = Date.now()) {
  const db = await getDb();
  const rs = await db.execute({
    sql: "UPDATE payments SET refunded_at = ? WHERE charge_id = ? AND refunded_at IS NULL",
    args: [now, r.telegram_payment_charge_id],
  });

  if (rs.rowsAffected !== 1) return;
  const shield = parseShieldPayload(r.invoice_payload);

  if (shield) return endRefundedShield(shield.userId, now);
  const userId = userFromPayload(r.invoice_payload) ?? payerId;

  await mutatePlayer(userId, now, (s) => ({ ...s, plus: { ...s.plus, until: Math.min(s.plus.until, now), paid: false } }));
}
