import "server-only";

import { getDb } from "./db";
import { appUrl, botToken, derive, tg } from "./bot";

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

const parseIds = (s: string) =>
  s
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

/** Admins: BOT_ADMIN_IDS, plus anyone who opened the secret admin link. */
export async function adminIds() {
  const db = await getDb();
  const rs = await db.execute("SELECT value FROM meta WHERE key = 'admin_ids'");

  return Array.from(new Set([...parseIds(process.env.BOT_ADMIN_IDS || ""), ...parseIds(String(rs.rows[0]?.value ?? ""))]));
}

export const isAdmin = async (id: number) => (await adminIds()).includes(id);

/** The command menu admins see when they type "/" (everyone else gets the players' menu). */
export const ADMIN_COMMANDS = [
  { command: "announce", description: "📢 Send an update announcement" },
  { command: "cancel", description: "✖️ Cancel the announcement" },
  { command: "stats", description: "📊 Player numbers" },
  { command: "releases", description: "🚀 Update posts: auto, ask me, or off" },
  { command: "start", description: "⚔️ Begin your legend" },
  { command: "tribe", description: "🏰 Your tribe at a glance" },
  { command: "top", description: "🏆 Top chiefs" },
  { command: "clan", description: "🛡️ Your clan" },
  { command: "news", description: "🔔 Update news on/off" },
];
/** Changes whenever the list does, so every admin's menu is brought up to date once. */
const MENU_VERSION = ADMIN_COMMANDS.map((c) => c.command).join(",");

/**
 * Makes sure this admin's "/" menu lists every admin command. Telegram keeps
 * a menu until it's set again, so an admin who got theirs before a command
 * was added (or was made an admin through BOT_ADMIN_IDS) didn't see it. Sets
 * it at most once per version of the list.
 */
export async function refreshAdminMenu(userId: number, force = false) {
  const db = await getDb();
  const key = `admin_menu:${userId}`;

  if (!force) {
    const rs = await db.execute({ sql: "SELECT value FROM meta WHERE key = ?", args: [key] });

    if (String(rs.rows[0]?.value ?? "") === MENU_VERSION) return;
  }
  const r = await tg("setMyCommands", { scope: { type: "chat", chat_id: userId }, commands: ADMIN_COMMANDS });

  if (r.ok) {
    await db.execute({
      sql: "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [key, MENU_VERSION],
    });
  }
}

/**
 * The secret admin link: t.me/<bot>?start=admin_<code>, where the code is
 * BOT_ADMIN_CODE or, by default, derived from the bot token (so no extra
 * setting is needed; a new token gives a new link). Opening it
 * makes that Telegram account an admin (no need to look up your user id), then
 * sends a test announcement of the version that's live right now.
 */
export async function claimAdmin(chatId: number, userId: number, payload: string) {
  const code = process.env.BOT_ADMIN_CODE || (botToken() ? derive("admin") : "");

  if (code.length < 16 || payload !== `admin_${code}`) return false;
  const db = await getDb();
  const ids = await adminIds();

  if (!ids.includes(userId)) {
    const stored = parseIds(String((await db.execute("SELECT value FROM meta WHERE key = 'admin_ids'")).rows[0]?.value ?? ""));

    await db.execute({
      sql: "INSERT INTO meta (key, value) VALUES ('admin_ids', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [[...stored, userId].join(",")],
    });
  }
  await refreshAdminMenu(userId, true);
  await say(
    chatId,
    `👑 <b>You're an admin of Valorians Legend.</b>\n\n` +
      `After every merged pull request goes live, I'll send you a draft update announcement to approve.\n\n` +
      `Here's a test with the version that's live now. Tap <b>🧪 Send to me only</b> to see exactly what players get. ` +
      `<b>Send to players</b> sends it for real.\n\nYou can also write one any time with /announce.`
  );
  // The test: draft the live version for this admin (and claim it, if nobody has yet).
  if (!(await checkRelease())) {
    const sha = process.env.VERCEL_GIT_COMMIT_SHA;

    if (sha) await draftRelease([userId], sha, await notesFor(sha));
    else await say(chatId, `⚠️ I can't tell which version is live (VERCEL_GIT_COMMIT_SHA is missing).`);
  }

  return true;
}

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
  if (!(await isAdmin(adminId))) return false;
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
  if (!(await isAdmin(adminId))) return false;
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
  if (!m.from || m.text?.startsWith("/") || !(await isAdmin(m.from.id))) return false;
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
  await say(m.chat.id, `👆 <b>Preview.</b> This is how players will see it.\n\nSend it?`, await controls(id));

  return true;
}

/** Send / channel / (rewrite) / cancel buttons under a preview. */
async function controls(id: number, rewrite = false) {
  const rows: object[][] = [[{ text: `📨 Send to ${fmt(await audience())} players`, callback_data: `ann:send:${id}` }]];

  if (channelId()) rows.push([{ text: "📨 Players + news channel", callback_data: `ann:both:${id}` }]);
  rows.push([{ text: "🧪 Send to me only", callback_data: `ann:test:${id}` }]);
  if (rewrite) rows.push([{ text: "✏️ Write my own", callback_data: `ann:edit:${id}` }]);
  rows.push([{ text: "✖️ Cancel", callback_data: `ann:cancel:${id}` }]);

  return rows;
}

/** Buttons on the preview: ann:send|both|test|edit|cancel:<id>. */
export async function announceButton(data: string, adminId: number, chatId: number) {
  if (!(await isAdmin(adminId))) return;
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
  if (action === "test") {
    // Exactly what a player gets, to this admin only; the draft stays open.
    const row = (await db.execute({ sql: "SELECT source_chat, source_msg FROM announcements WHERE id = ?", args: [id] }))
      .rows[0];

    if (row) {
      await tg("copyMessage", {
        chat_id: chatId,
        from_chat_id: Number(row.source_chat),
        message_id: Number(row.source_msg),
        reply_markup: playerMarkup(),
      });
      await say(chatId, `🧪 That's what players will see. Send it to them?`, await controls(id, true));
    }

    return;
  }
  if (action === "edit") {
    // Drop the release draft and take the admin's own post instead.
    await startAnnounce(chatId, adminId);

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
  // A release draft goes to every admin; once one sends it, retire the others.
  await db.execute({
    sql: `UPDATE announcements SET status = 'cancelled'
          WHERE status = 'draft' AND id != ? AND release IS NOT NULL
            AND release = (SELECT release FROM announcements WHERE id = ?)`,
    args: [id, id],
  });

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

// ─── New versions ────────────────────────────────────────────────────────────

/**
 * After a new version deploys, drafts an announcement from what changed and
 * sends it to the admins for approval (nothing reaches players until an admin
 * taps Send). Runs from the cron; a deploy is noticed within a few minutes.
 *
 * The version is Vercel's VERCEL_GIT_COMMIT_SHA. What changed comes from
 * GitHub: the titles of the pull requests merged since the last announced
 * version (or commit subjects for direct pushes). The very first run drafts
 * only that version's own changes, so the whole history is never announced.
 */
const repo = () =>
  process.env.GITHUB_REPO ||
  (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
    ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
    : "");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "What changed" between two commits: PR titles, else commit subjects. */
async function changesBetween(from: string, to: string) {
  const res = await github(`compare/${from}...${to}`);

  if (!res.ok) throw new Error(`GitHub compare failed: ${res.status}`);
  const data = (await res.json()) as { commits?: { commit: { message: string } }[] };
  const messages = (data.commits ?? []).map((c) => c.commit.message);
  // "Merge pull request #81 from …\n\nUpdate announcements in the Telegram bot"
  const prs = messages
    .filter((m) => /^Merge pull request #\d+/.test(m))
    .map((m) => m.split("\n").slice(1).find((l) => l.trim())?.trim() ?? "")
    .filter(Boolean);
  // Squash merges look like "Title (#82)".
  const squashed = messages.map((m) => m.split("\n")[0]).filter((l) => /\(#\d+\)$/.test(l)).map((l) => l.replace(/\s*\(#\d+\)$/, ""));
  const titles = prs.length || squashed.length ? [...prs, ...squashed] : messages.map((m) => m.split("\n")[0]).filter((l) => !/^Merge /.test(l));

  return Array.from(new Set(titles)).slice(0, 12);
}

const github = (path: string) =>
  fetch(`https://api.github.com/repos/${repo()}/${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

async function parentOf(sha: string) {
  const res = await github(`commits/${sha}`);

  if (!res.ok) throw new Error(`GitHub commit failed: ${res.status}`);
  const data = (await res.json()) as { parents?: { sha: string }[] };

  return data.parents?.[0]?.sha ?? sha;
}

/**
 * checkRelease from busy paths (players opening the game, the bot webhook):
 * one cheap SELECT at most once a minute per server instance, so a new
 * version is noticed even when the scheduled cron runs late.
 */
let lastReleaseCheck = 0;

export async function maybeCheckRelease() {
  if (Date.now() - lastReleaseCheck < 60_000) return;
  // Once per server start (so after each deploy): bring admins' "/" menus up to date.
  if (!lastReleaseCheck) {
    for (const id of await adminIds().catch(() => [] as number[])) await refreshAdminMenu(id).catch(() => {});
  }
  lastReleaseCheck = Date.now();
  await checkRelease().catch((e) => {
    // eslint-disable-next-line no-console
    console.error("release check failed", e);
  });
}

type ReleaseMode = "auto" | "draft" | "off";

const asMode = (m: string): ReleaseMode | null => (m === "auto" || m === "draft" || m === "off" ? m : null);

/**
 * What happens when a new version goes live: posted to players straight away
 * ("auto"), drafted for an admin to send or skip ("draft"), or nothing
 * ("off"; /announce still works). Admins switch it with /releases; until
 * anyone has, RELEASE_ANNOUNCE decides (auto by default).
 */
async function releaseMode(): Promise<ReleaseMode> {
  const db = await getDb();
  const rs = await db.execute("SELECT value FROM meta WHERE key = 'release_mode'");

  return asMode(String(rs.rows[0]?.value ?? "")) ?? asMode((process.env.RELEASE_ANNOUNCE || "").toLowerCase()) ?? "auto";
}

const MODES: { mode: ReleaseMode; label: string; note: string }[] = [
  { mode: "auto", label: "🚀 Automatic", note: "every new version is announced to players right away" },
  { mode: "draft", label: "✋ Ask me first", note: "you get a draft for each new version: send it, rewrite it or skip it" },
  { mode: "off", label: "🔕 Off", note: "no posts for new versions; /announce still works" },
];

/** /releases: how new versions are announced now, with a button for each choice. */
export async function sendReleaseMode(chatId: number, userId: number) {
  if (!(await isAdmin(userId))) return false;
  const now = await releaseMode();
  const current = MODES.find((m) => m.mode === now)!;

  await say(
    chatId,
    `🚀 <b>Update posts</b>\n\nNow: <b>${current.label}</b>, ${current.note}.\n\nChoose how new versions are announced:`,
    MODES.map((m) => [{ text: `${m.mode === now ? "✅ " : ""}${m.label}`, callback_data: `rel:${m.mode}` }])
  );

  return true;
}

/** The /releases buttons: rel:auto|draft|off. */
export async function releaseButton(data: string, adminId: number, chatId: number) {
  const mode = asMode(data.split(":")[1] ?? "");

  if (!mode || !(await isAdmin(adminId))) return;
  const db = await getDb();

  await db.execute({
    sql: "INSERT INTO meta (key, value) VALUES ('release_mode', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: [mode],
  });
  const m = MODES.find((x) => x.mode === mode)!;

  await say(chatId, `✅ Update posts set to <b>${m.label}</b>: ${m.note}.`);
}

const releasePost = (changes: string[]) =>
  `🆕 <b>Valorians Legend has been updated!</b>\n\n` +
  (changes.length ? changes.map((c) => `• ${esc(c)}`).join("\n") + "\n\n" : "") +
  `Tap <b>Play now</b> to see what's new, chief! ⚔️`;

export async function checkRelease() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const mode = await releaseMode();
  const admins = await adminIds();

  if (!sha || mode === "off" || (mode === "draft" && !admins.length)) return null;
  const db = await getDb();

  await db.execute({ sql: "INSERT OR IGNORE INTO meta (key, value) VALUES ('release_sha', '')", args: [] });
  const last = String((await db.execute("SELECT value FROM meta WHERE key = 'release_sha'")).rows[0]?.value ?? "");

  if (last === sha) return null;
  // Claim this version, so two cron runs at once can't both draft it.
  const claim = await db.execute({
    sql: "UPDATE meta SET value = ? WHERE key = 'release_sha' AND value = ?",
    args: [sha, last],
  });

  if (!claim.rowsAffected || !repo()) return null;
  const changes = await notesFor(sha, last);

  if (mode === "draft") {
    await draftRelease(admins, sha, changes);

    return { release: sha.slice(0, 7), changes: changes.length, mode };
  }
  // Nothing players would care to read (couldn't tell what changed): skip it.
  if (!changes.length) return { release: sha.slice(0, 7), changes: 0, mode, skipped: true };
  const total = await audience();
  const now = Date.now();

  await db.execute({
    sql: `INSERT INTO announcements (admin_id, status, release, body, total, created_at, started_at)
          VALUES (0, 'sending', ?, ?, ?, ?, ?)`,
    args: [sha, releasePost(changes), total, now, now],
  });
  if (channelId()) {
    await tg("sendMessage", {
      chat_id: channelId(),
      text: releasePost(changes),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(channelMarkup() ? { reply_markup: channelMarkup() } : {}),
    });
  }
  for (const admin of admins) {
    await say(
      admin,
      `🚀 <b>New version live</b> (<code>${sha.slice(0, 7)}</code>). Announcing it to ${fmt(total)} players now:\n\n` +
        changes.map((c) => `• ${esc(c)}`).join("\n")
    );
  }

  return { release: sha.slice(0, 7), changes: changes.length, mode, total };
}

/** What changed since `last` (or, the first time, in this version alone). */
async function notesFor(sha: string, last = "") {
  if (!repo()) return [];
  try {
    return await changesBetween(last || (await parentOf(sha)), sha);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("release notes failed", e);

    return [];
  }
}

/** Sends each admin the drafted announcement for `sha` with the approve buttons. */
async function draftRelease(admins: number[], sha: string, changes: string[]) {
  const db = await getDb();
  const short = sha.slice(0, 7);
  const post = releasePost(changes);

  for (const admin of admins) {
    await db.execute({
      sql: "UPDATE announcements SET status = 'cancelled' WHERE admin_id = ? AND status IN ('awaiting', 'draft')",
      args: [admin],
    });
    await say(
      admin,
      `🚀 <b>New version live</b> (<code>${short}</code>)\n\n` +
        (changes.length
          ? `Here's a draft announcement from what changed. Want to change it? Tap <b>Write my own</b>.`
          : `I couldn't read what changed, so here's a short draft. Tap <b>Write my own</b> to say more.`)
    );
    // The draft itself is the post players will get (copied when sent).
    const draft = (await tg("sendMessage", {
      chat_id: admin,
      text: post,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: playerMarkup(),
    })) as TgResult & { result?: { message_id: number } };

    if (!draft.ok || !draft.result) continue;
    const row = await db.execute({
      sql: `INSERT INTO announcements (admin_id, source_chat, source_msg, status, release, created_at)
            VALUES (?, ?, ?, 'draft', ?, ?) RETURNING id`,
      args: [admin, admin, draft.result.message_id, sha, Date.now()],
    });

    await say(admin, `Send it to players?`, await controls(Number(row.rows[0].id), true));
  }
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
            a.body
              ? tg("sendMessage", {
                  chat_id: chatId,
                  text: String(a.body),
                  parse_mode: "HTML",
                  link_preview_options: { is_disabled: true },
                  reply_markup: playerMarkup(),
                })
              : tg("copyMessage", {
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
      // Automatic release posts have no admin of their own: tell them all.
      const report = Number(a.admin_id) ? [Number(a.admin_id)] : await adminIds();

      for (const to of report) {
        await say(
          to,
          `✅ <b>Announcement delivered</b>\n\n` +
            `📨 ${fmt(Number(r.sent))} players got it\n` +
            `🚫 ${fmt(Number(r.failed))} couldn't be reached (blocked or never started the bot)\n` +
            `⏱️ ${mins} min`
        );
      }
    }
    if (Date.now() + 1_500 >= deadline) break;
  }
}
