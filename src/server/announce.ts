import "server-only";

import { getDb } from "./db";
import { appUrl, tg } from "./bot";

/**
 * Update announcements broadcast from the bot chat.
 *
 * An admin (BOT_ADMIN_IDS) sends /announce, then the post itself: text, a
 * photo or video with a caption, an album cover... anything Telegram can copy.
 * The bot shows a preview with buttons to send it to every player (and
 * optionally the news channel). Sending runs in batches under Telegram's rate
 * limit: a first batch right away, the rest from the cron, resuming where the
 * last batch stopped. Players can mute news with /news or the button under
 * each announcement; players who blocked the bot are skipped from then on.
 */

export const adminIds = () =>
  (process.env.BOT_ADMIN_IDS || "")
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

export const isAdmin = (id: number) => adminIds().includes(id);

const channelId = () => process.env.TELEGRAM_CHANNEL_ID || "";

/** ~25 messages a second stays under Telegram's ~30/s broadcast limit. */
const BATCH = 25;
const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type TgResult = { ok: boolean; description?: string; error_code?: number; parameters?: { retry_after?: number } };

// ─── Buttons under the announcement ──────────────────────────────────────────

/** In a player's private chat: open the game in place, or mute news. */
const playerMarkup = () => ({
  inline_keyboard: [
    [{ text: "⚔️ Play now", web_app: { url: appUrl() } }],
    [{ text: "🔕 Mute news", callback_data: "news:off" }],
  ],
});

/** Channels can't open Mini Apps from a web_app button, so link to it instead. */
const channelMarkup = () => {
  const bot = (process.env.NEXT_PUBLIC_BOT_ADDRESS || "").replace(/^@/, "");
  const app = process.env.NEXT_PUBLIC_APP_SHORT_NAME;

  if (!bot) return undefined;

  return { inline_keyboard: [[{ text: "⚔️ Play now", url: `https://t.me/${bot}${app ? `/${app}` : ""}` }]] };
};

const audience = async () => {
  const db = await getDb();
  const rs = await db.execute("SELECT COUNT(*) AS n FROM users WHERE news_off = 0 AND bot_blocked = 0");

  return Number(rs.rows[0]?.n ?? 0);
};

const say = (chatId: number, text: string, rows?: object[][]) =>
  tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(rows ? { reply_markup: { inline_keyboard: rows } } : {}),
  });

// ─── Admin flow ──────────────────────────────────────────────────────────────

/** /announce: wait for the admin's next message, which becomes the post. */
export async function startAnnounce(chatId: number, adminId: number) {
  if (!isAdmin(adminId)) return false;
  const db = await getDb();

  await db.execute({
    sql: "UPDATE announcements SET status = 'cancelled' WHERE admin_id = ? AND status IN ('awaiting', 'draft')",
    args: [adminId],
  });
  await db.execute({
    sql: "INSERT INTO announcements (admin_id, status, created_at) VALUES (?, 'awaiting', ?)",
    args: [adminId, Date.now()],
  });
  await say(
    chatId,
    `📢 <b>New announcement</b>\n\n` +
      `Send me the post now: text, or a photo or video with a caption. Formatting, emoji and links are kept.\n\n` +
      `I'll show you a preview before anything goes out. /cancel to stop.`
  );

  return true;
}

export async function cancelAnnounce(chatId: number, adminId: number) {
  if (!isAdmin(adminId)) return false;
  const db = await getDb();
  const rs = await db.execute({
    sql: "UPDATE announcements SET status = 'cancelled' WHERE admin_id = ? AND status IN ('awaiting', 'draft')",
    args: [adminId],
  });

  await say(chatId, rs.rowsAffected ? "✖️ Announcement cancelled." : "Nothing to cancel.");

  return true;
}

/**
 * If this admin is waiting to send a post, takes the message as the draft and
 * shows the preview. Returns true when the message was used.
 */
export async function takeAdminPost(m: { chat: { id: number }; from?: { id: number }; message_id: number; text?: string }) {
  if (!m.from || !isAdmin(m.from.id) || m.text?.startsWith("/")) return false;
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT id FROM announcements WHERE admin_id = ? AND status = 'awaiting' ORDER BY id DESC LIMIT 1",
    args: [m.from.id],
  });
  const id = Number(rs.rows[0]?.id ?? 0);

  if (!id) return false;
  await db.execute({
    sql: "UPDATE announcements SET status = 'draft', source_chat = ?, source_msg = ? WHERE id = ?",
    args: [m.chat.id, m.message_id, id],
  });

  // The preview is exactly what players will get, buttons included.
  const preview = (await tg("copyMessage", {
    chat_id: m.chat.id,
    from_chat_id: m.chat.id,
    message_id: m.message_id,
    reply_markup: playerMarkup(),
  })) as TgResult;

  if (!preview.ok) {
    await say(m.chat.id, `⚠️ I can't copy that message (${preview.description}). Try a different post, or /cancel.`);
    await db.execute({ sql: "UPDATE announcements SET status = 'awaiting' WHERE id = ?", args: [id] });

    return true;
  }
  const n = await audience();
  const rows: object[][] = [[{ text: `📨 Send to ${fmt(n)} players`, callback_data: `ann:send:${id}` }]];

  if (channelId()) rows.push([{ text: "📨 Players + news channel", callback_data: `ann:both:${id}` }]);
  rows.push([{ text: "✖️ Cancel", callback_data: `ann:cancel:${id}` }]);
  await say(m.chat.id, `👆 <b>Preview.</b> This is how players will see it.\n\nSend it?`, rows);

  return true;
}

/** Buttons on the preview: ann:send:<id>, ann:both:<id>, ann:cancel:<id>. */
export async function announceButton(data: string, adminId: number, chatId: number) {
  if (!isAdmin(adminId)) return;
  const [, action, raw] = data.split(":");
  const id = Number(raw);
  const db = await getDb();

  if (action === "cancel") {
    await db.execute({
      sql: "UPDATE announcements SET status = 'cancelled' WHERE id = ? AND status = 'draft'",
      args: [id],
    });
    await say(chatId, "✖️ Announcement cancelled.");

    return;
  }
  const toChannel = action === "both" && !!channelId();
  const total = await audience();
  // Only the first tap starts it, so a double tap or a webhook retry can't send twice.
  const rs = await db.execute({
    sql: `UPDATE announcements SET status = 'sending', to_channel = ?, total = ?, started_at = ?
          WHERE id = ? AND admin_id = ? AND status = 'draft'`,
    args: [toChannel ? 1 : 0, total, Date.now(), id, adminId],
  });

  if (!rs.rowsAffected) return;

  if (toChannel) {
    const row = (await db.execute({ sql: "SELECT source_chat, source_msg FROM announcements WHERE id = ?", args: [id] }))
      .rows[0];
    const posted = (await tg("copyMessage", {
      chat_id: channelId(),
      from_chat_id: Number(row.source_chat),
      message_id: Number(row.source_msg),
      ...(channelMarkup() ? { reply_markup: channelMarkup() } : {}),
    })) as TgResult;

    await say(
      chatId,
      posted.ok
        ? "📢 Posted to the news channel."
        : `⚠️ Couldn't post to the channel (${posted.description}). Is the bot an admin there with permission to post?`
    );
  }
  await say(chatId, `📨 Sending to ${fmt(total)} players… I'll message you when it's done.`);
  // A first batch now; the cron finishes the rest.
  await deliverAnnouncements(8_000);
}

// ─── Players ─────────────────────────────────────────────────────────────────

/** /news or the 🔕 button: mute or unmute announcements. */
export async function setNews(userId: number, on: boolean) {
  const db = await getDb();

  await db.execute({ sql: "UPDATE users SET news_off = ? WHERE id = ?", args: [on ? 0 : 1, userId] });
}

export async function newsIsOn(userId: number) {
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT news_off FROM users WHERE id = ?", args: [userId] });

  return !Number(rs.rows[0]?.news_off ?? 0);
}

/** A player who writes to the bot can be reached again. */
export async function markReachable(userId: number) {
  const db = await getDb();

  await db.execute({ sql: "UPDATE users SET bot_blocked = 0 WHERE id = ? AND bot_blocked = 1", args: [userId] });
}

// ─── Delivery ────────────────────────────────────────────────────────────────

const unreachable = (r: TgResult) =>
  r.error_code === 403 || /chat not found|user is deactivated|bot was blocked/i.test(r.description ?? "");

/**
 * Sends announcements that are going out, for up to `budgetMs`. Safe to call
 * from several places at once: each announcement is leased to one sender.
 */
export async function deliverAnnouncements(budgetMs: number) {
  const db = await getDb();
  const deadline = Date.now() + budgetMs;
  const due = await db.execute("SELECT * FROM announcements WHERE status = 'sending' ORDER BY id");

  for (const a of due.rows) {
    const id = Number(a.id);
    const lease = await db.execute({
      sql: "UPDATE announcements SET locked_until = ? WHERE id = ? AND status = 'sending' AND locked_until < ?",
      args: [deadline + 15_000, id, Date.now()],
    });

    if (!lease.rowsAffected) continue;
    let cursor = Number(a.cursor);
    let sent = 0;
    let failed = 0;
    let finished = false;

    try {
      while (Date.now() + 1_500 < deadline) {
        const batch = await db.execute({
          sql: "SELECT id FROM users WHERE id > ? AND news_off = 0 AND bot_blocked = 0 ORDER BY id LIMIT ?",
          args: [cursor, BATCH],
        });
        const ids = batch.rows.map((r) => Number(r.id));

        if (!ids.length) {
          finished = true;
          break;
        }
        const started = Date.now();
        const results = (await Promise.all(
          ids.map((chatId) =>
            tg("copyMessage", {
              chat_id: chatId,
              from_chat_id: Number(a.source_chat),
              message_id: Number(a.source_msg),
              reply_markup: playerMarkup(),
            })
          )
        )) as TgResult[];
        // Too fast: keep everyone from the first throttled player on for next time.
        const throttled = results.findIndex((r) => r.error_code === 429);
        const done = throttled === -1 ? results.length : throttled;
        const blocked: number[] = [];

        for (let i = 0; i < done; i++) {
          if (results[i].ok) sent++;
          else {
            failed++;
            if (unreachable(results[i])) blocked.push(ids[i]);
          }
        }
        if (done) cursor = ids[done - 1];
        if (blocked.length) {
          await db.execute({
            sql: `UPDATE users SET bot_blocked = 1 WHERE id IN (${blocked.map(() => "?").join(",")})`,
            args: blocked,
          });
        }
        await db.execute({
          sql: "UPDATE announcements SET cursor = ?, sent = sent + ?, failed = failed + ? WHERE id = ?",
          args: [cursor, sent, failed, id],
        });
        sent = 0;
        failed = 0;
        if (throttled !== -1) {
          await sleep(Math.min(5, results[throttled].parameters?.retry_after ?? 3) * 1000);
          continue;
        }
        await sleep(Math.max(0, 1_000 - (Date.now() - started)));
      }
    } finally {
      await db.execute({
        sql: `UPDATE announcements SET locked_until = 0
              ${finished ? ", status = 'done', finished_at = ?" : ""} WHERE id = ?`,
        args: finished ? [Date.now(), id] : [id],
      });
    }
    if (finished) {
      const r = (await db.execute({ sql: "SELECT sent, failed, started_at FROM announcements WHERE id = ?", args: [id] }))
        .rows[0];
      const mins = Math.max(1, Math.round((Date.now() - Number(r.started_at)) / 60_000));

      await say(
        Number(a.admin_id),
        `✅ <b>Announcement delivered</b>\n\n` +
          `📨 ${fmt(Number(r.sent))} players got it\n` +
          `🚫 ${fmt(Number(r.failed))} couldn't be reached (blocked or never started the bot)\n` +
          `⏱️ ${mins} min`
      );
    }
    if (Date.now() + 1_500 >= deadline) break;
  }
}
