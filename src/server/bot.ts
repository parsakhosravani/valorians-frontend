import "server-only";

import crypto from "crypto";

import {
  ADMIN_COMMANDS,
  adminIds,
  announceButton,
  cancelAnnounce,
  claimAdmin,
  isAdmin,
  markReachable,
  newsIsOn,
  refreshAdminMenu,
  releaseButton,
  sendReleaseMode,
  setNews,
  startAnnounce,
  takeAdminPost,
} from "./announce";
import { getDb } from "./db";
import { findById, rankOf } from "./players";
import { PreCheckoutQuery, RefundedPayment, SuccessfulPayment, answerPreCheckout, plusPrice, recordPayment, recordRefund } from "./plus";
import { sendStats } from "./stats";
import { displayName } from "./war";

import { FLAG_EMBLEMS, TECH_IDS, Techs, clanLevel, maxMembers, storedFlag } from "@/lib/game/clan";
import { CLAN, PLUS, RESOURCE_IDS, RESOURCE_NAMES, START, questUrl } from "@/lib/game/config";
import { advance, plusActive } from "@/lib/game/engine";
import { powerScore } from "@/lib/game/war";

/**
 * The @valorians_bot chat: welcome, commands and buttons around the game.
 * Telegram calls POST /api/bot (webhook) for every message and button tap;
 * /api/bot/setup sets the bot's profile texts, command menu and Play button.
 */

const API = () => process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
export const botToken = () => process.env.TELEGRAM_BOT_TOKEN || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || "";

/** Secrets derived from the bot token, so no extra env vars are needed. */
export const derive = (purpose: string) =>
  crypto.createHash("sha256").update(`${botToken()}:${purpose}`).digest("hex").slice(0, 32);
export const webhookSecret = () => derive("webhook");

export async function tg(method: string, body: object) {
  const token = botToken();

  if (!token) return { ok: false, description: "no bot token" };
  try {
    const res = await fetch(`${API()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
      body: JSON.stringify(body),
    });

    return (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  } catch (e) {
    return { ok: false, description: (e as Error).message };
  }
}

// ─── Links and buttons ───────────────────────────────────────────────────────

export const appUrl = () => (process.env.APP_URL || "https://valorians-legend.vercel.app").replace(/\/$/, "");

type Button = { text: string; url?: string; callback_data?: string; web_app?: { url: string } };

/** In the bot's own chat a web_app button opens the game in place. `path` opens a screen. */
const playButton = (text = "⚔️ Play Valorians", path = ""): Button => ({ text, web_app: { url: `${appUrl()}${path}` } });

const channel = () => questUrl("telegram", process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL);

const menuRows = (): Button[][] => [
  [
    { text: "🏰 My tribe", callback_data: "tribe" },
    { text: "🏆 Top chiefs", callback_data: "top" },
  ],
  [
    { text: "🛡️ My clan", callback_data: "clan" },
    { text: "📜 How to play", callback_data: "help" },
  ],
  ...(channel() ? [[{ text: "📢 News & events", url: channel()! }]] : []),
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : fmt(n);

const send = (chatId: number, text: string, rows: Button[][]) =>
  tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: rows },
  });

// ─── Screens ─────────────────────────────────────────────────────────────────

async function welcome(chatId: number, firstName: string) {
  const caption =
    `⚔️ <b>Welcome to Valorians Legend, ${esc(firstName || "chief")}!</b>\n\n` +
    `The longships are ready and the dragons are restless. Raise your village, ` +
    `train an army and write your name into the sagas.\n\n` +
    `🏰 Build and upgrade 24 buildings\n` +
    `⛏️ Mine resources every day\n` +
    `🗺️ March armies across a live world map\n` +
    `🤝 Trade with other chiefs on the Market\n` +
    `🛡️ Found or join a clan\n\n` +
    `🎁 <b>Starter gift:</b> ${fmt(START.coins)} coins and ${fmt(START.resources)} of every resource` +
    `\n\nTap <b>Play</b> to claim your land.`;
  const rows = [[playButton("⚔️ Play now")], ...menuRows()];
  const photo = await tg("sendPhoto", {
    chat_id: chatId,
    photo: `${appUrl()}/bot/welcome-v2.jpg`,
    caption,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });

  // If the picture can't be sent, the text alone still welcomes them.
  if (!photo.ok) await send(chatId, caption, rows);
}

async function howToPlay(chatId: number) {
  await send(
    chatId,
    `📜 <b>How to play</b>\n\n` +
      `<b>1. Build.</b> Mines, Sawmill, Brickyard and Windmill produce resources every hour, even while you're away. ` +
      `The Town Hall builds faster and unlocks more builders.\n\n` +
      `<b>2. Mine daily.</b> Strike the rocks in the Daily Mine for a big boost. Stamina refills every day.\n\n` +
      `<b>3. Train an army.</b> Spearmen and swordsmen hold the line, archers and axemen hit hard, cavalry, paladins and knights ride fast, rams and catapults break defenses.\n\n` +
      `<b>4. Conquer the map.</b> Raid barbarian camps and rival tribes. Armies take time to march, so plan your strikes. ` +
      `Hills and forests help defenders; scout before you attack.\n\n` +
      `<b>5. Join a clan.</b> Band together with other chiefs, or found your own clan and lead it up the clan ranks.\n\n` +
      `<b>6. Trade.</b> Build a Trading Post and swap your extra resources with other chiefs.\n\n` +
      `<b>7. Rise.</b> Climb the leaderboard by population, power and victories. Claim your login streak every day!`,
    [[playButton()], [{ text: "« Menu", callback_data: "menu" }]]
  );
}

async function myTribe(chatId: number, userId: number) {
  const p = await findById(userId);

  if (!p) {
    await send(chatId, `🏕️ You haven't founded a tribe yet.\n\nOpen the game to claim your land and your starter gift.`, [
      [playButton("⚔️ Found my tribe")],
    ]);

    return;
  }
  const now = Date.now();
  const s = advance(p.state, now);
  const rank = await rankOf({ ...p, state: s });
  const shield = s.shieldUntil > now ? Math.ceil((s.shieldUntil - now) / 3600e3) : 0;
  const busy = s.queue.length;
  const res = RESOURCE_IDS.map((r) => `${RESOURCE_NAMES[r]} ${compact(s.resources[r])}`).join(" · ");

  await send(
    chatId,
    `🏰 <b>${esc(displayName(p))}'s tribe</b>\n\n` +
      `🏆 Rank <b>#${fmt(rank)}</b> · 👥 ${fmt(s.population)} people\n` +
      `💪 Power ${compact(powerScore(s))} · ⚔️ ${fmt(s.war.attacksWon + s.war.defensesWon)} victories\n` +
      `🪙 ${fmt(s.coins)} coins\n` +
      `📦 ${res}\n\n` +
      (busy ? `🔨 ${busy} building${busy > 1 ? "s" : ""} under construction\n` : `🔨 Your builders are idle!\n`) +
      (shield ? `🛡️ Shielded for ${shield}h more` : `⚠️ No shield: rivals can raid you`),
    [[playButton("⚔️ Open my tribe")], [{ text: "« Menu", callback_data: "menu" }]]
  );
}

async function topChiefs(chatId: number, userId: number) {
  const db = await getDb();
  const rs = await db.execute(
    "SELECT id, username, first_name, population FROM users ORDER BY population DESC, id ASC LIMIT 10"
  );
  const medal = ["🥇", "🥈", "🥉"];
  const lines = rs.rows.map((r, i) => {
    const name = esc(String(r.first_name || (r.username ? `@${r.username}` : "Player")));
    const me = Number(r.id) === userId;

    return `${medal[i] ?? `${i + 1}.`} ${me ? `<b>${name} (you)</b>` : name} · ${compact(Number(r.population))} 👥`;
  });

  await send(chatId, `🏆 <b>Top chiefs</b> by population\n\n${lines.join("\n") || "No tribes yet. Be the first!"}`, [
    [playButton("⚔️ Climb the ranks")],
    [{ text: "« Menu", callback_data: "menu" }],
  ]);
}

async function myClan(chatId: number, userId: number) {
  const p = await findById(userId);
  const back = { text: "« Menu", callback_data: "menu" };

  if (!p?.clanId) {
    await send(
      chatId,
      `🛡️ <b>Clans</b>\n\nYou're not in a clan yet. Join one of the strongest, or found your own ` +
        `for ${fmt(CLAN.createCost)} coins and lead up to ${CLAN.maxMembers} chiefs.`,
      [[playButton("🛡️ Find a clan", "/clan")], [back]]
    );

    return;
  }
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT c.*, COUNT(u.id) AS members, COALESCE(SUM(u.population), 0) AS population
          FROM clans c LEFT JOIN users u ON u.clan_id = c.id WHERE c.id = ? GROUP BY c.id`,
    args: [p.clanId],
  });
  const c = rs.rows[0];

  if (!c) return menu(chatId);
  const techs = Object.fromEntries(TECH_IDS.map((t) => [t, Number(c[`tech_${t}`] ?? 0)])) as Techs;
  const flag = storedFlag(c.flag, Number(c.id));
  const emblem = flag.emblem >= 0 ? `${FLAG_EMBLEMS[flag.emblem]} ` : "";
  const top = await db.execute({
    sql: "SELECT username, first_name, population FROM users WHERE clan_id = ? ORDER BY population DESC LIMIT 5",
    args: [p.clanId],
  });
  const lines = top.rows
    .map((r, i) => `${i + 1}. ${esc(String(r.first_name || (r.username ? `@${r.username}` : "Player")))} · ${compact(Number(r.population))} 👥`)
    .join("\n");

  await send(
    chatId,
    `${emblem}<b>[${esc(String(c.tag))}] ${esc(String(c.name))}</b> · level ${clanLevel(techs)}\n\n` +
      `👥 ${fmt(Number(c.members))}/${maxMembers(techs)} members · ${compact(Number(c.population))} people\n` +
      (Number(c.leader_id) === userId ? `👑 You lead this clan\n` : "") +
      `\n<b>Strongest members</b>\n${lines}`,
    [[playButton("🛡️ Open my clan", "/clan")], [back]]
  );
}

async function plusInfo(chatId: number, userId: number) {
  const p = await findById(userId);
  const now = Date.now();
  const active = p ? plusActive(advance(p.state, now)) : false;
  const days = p && active ? Math.ceil((p.state.plus.until - now) / 86400e3) : 0;

  await send(
    chatId,
    `👑 <b>Valorians Plus</b>\n\n` +
      `🔨 +${PLUS.extraBuilders} builder, so one more building goes up at a time\n` +
      `⚔️ +${PLUS.extraTrainBatches} training slots in the barracks queue\n` +
      `🛡️ A free ${PLUS.weeklyShieldHours}h shield every week\n` +
      `👑 The Plus crown next to your name\n\n` +
      (active
        ? `✅ Your Plus is active for ${days} more day${days === 1 ? "" : "s"}.`
        : `⭐ ${fmt(plusPrice())} Stars a month, cancel anytime.` +
          (p && !p.state.plus.trialUsed ? ` Try it free for ${Math.round(PLUS.trialMs / 86400e3)} days first.` : "")),
    [[playButton(active ? "⚔️ Open my tribe" : "👑 Get Plus", "/hall?plus=1")], [{ text: "« Menu", callback_data: "menu" }]]
  );
}

async function menu(chatId: number) {
  await send(chatId, `⚔️ <b>Valorians Legend</b>\n\nWhat would you like to do, chief?`, [[playButton()], ...menuRows()]);
}

// ─── Webhook entry ───────────────────────────────────────────────────────────

type Update = {
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string };
    text?: string;
    successful_payment?: SuccessfulPayment;
    refunded_payment?: RefundedPayment;
  };
  pre_checkout_query?: PreCheckoutQuery;
  callback_query?: { id: string; from: { id: number; first_name?: string }; message?: { chat: { id: number } }; data?: string };
};

export async function handleUpdate(u: Update) {
  // Stars payments come first: Telegram cancels a checkout left unanswered for 10s.
  if (u.pre_checkout_query) return answerPreCheckout(u.pre_checkout_query);
  if (u.message?.from && u.message.successful_payment) {
    await recordPayment(u.message.from.id, u.message.successful_payment);

    return;
  }
  if (u.message?.from && u.message.refunded_payment) return recordRefund(u.message.from.id, u.message.refunded_payment);
  if (u.callback_query) {
    const q = u.callback_query;
    const chatId = q.message?.chat.id ?? q.from.id;

    if (q.data === "news:off") {
      await setNews(q.from.id, false);
      await tg("answerCallbackQuery", {
        callback_query_id: q.id,
        text: "🔕 News muted. Send /news to turn it back on.",
        show_alert: true,
      });

      return;
    }
    await tg("answerCallbackQuery", { callback_query_id: q.id });
    if (q.data?.startsWith("ann:")) return announceButton(q.data, q.from.id, chatId);
    if (q.data?.startsWith("rel:")) return releaseButton(q.data, q.from.id, chatId);
    await route(q.data ?? "menu", chatId, q.from.id, q.from.first_name ?? "");

    return;
  }
  const m = u.message;

  if (!m?.from || m.chat.type !== "private") return;
  await markReachable(m.from.id).catch(() => {});
  // An admin's post after /announce (it may be a photo or video, not just text).
  if (await takeAdminPost(m)) return;
  if (!m.text) return;
  const [cmd] = m.text.trim().split(/\s+/);
  const name = cmd.replace(/^\//, "").replace(/@.*$/, "").toLowerCase();

  // An admin typing a command: make sure their "/" menu lists every admin command.
  if (cmd.startsWith("/") && (await isAdmin(m.from.id))) await refreshAdminMenu(m.from.id).catch(() => {});

  if (name === "start") {
    const payload = m.text.trim().split(/\s+/)[1] ?? "";

    if (payload.startsWith("admin_") && (await claimAdmin(m.chat.id, m.from.id, payload))) return;

    return welcome(m.chat.id, m.from.first_name ?? "");
  }
  if (name === "announce" && (await startAnnounce(m.chat.id, m.from.id))) return;
  if (name === "cancel" && (await cancelAnnounce(m.chat.id, m.from.id))) return;
  if (name === "stats" && (await sendStats(m.chat.id, m.from.id))) return;
  if (name === "releases" && (await sendReleaseMode(m.chat.id, m.from.id))) return;
  if (name === "news") return toggleNews(m.chat.id, m.from.id);

  return route(name, m.chat.id, m.from.id, m.from.first_name ?? "");
}

async function toggleNews(chatId: number, userId: number) {
  const on = !(await newsIsOn(userId));

  await setNews(userId, on);
  await send(
    chatId,
    on
      ? `🔔 <b>News on.</b> You'll get update announcements here. Send /news again to mute them.`
      : `🔕 <b>News muted.</b> You won't get update announcements. Battle alerts still come through. Send /news to turn news back on.`,
    [[{ text: "« Menu", callback_data: "menu" }]]
  );
}

function route(name: string, chatId: number, userId: number, firstName: string) {
  switch (name) {
    case "play":
      return send(chatId, `⚔️ Your tribe awaits, ${esc(firstName || "chief")}!`, [[playButton()]]);
    case "tribe":
    case "me":
      return myTribe(chatId, userId);
    case "top":
    case "leaderboard":
      return topChiefs(chatId, userId);
    case "clan":
      return myClan(chatId, userId);
    case "help":
      return howToPlay(chatId);
    case "plus":
      return plusInfo(chatId, userId);
    default:
      return menu(chatId);
  }
}

// ─── One-time setup: profile texts, command menu, Play button, webhook ──────

/** Update kinds the webhook receives; pre_checkout_query is needed for Stars payments. */
const ALLOWED_UPDATES = ["message", "callback_query", "pre_checkout_query"];

export async function setupBot() {
  const base = appUrl();
  const steps: Record<string, unknown> = {};
  const run = async (method: string, body: object) => {
    const r = await tg(method, body);

    steps[method] = r.ok ? "ok" : r.description;
  };

  await run("setMyName", { name: "Valorians Legend" });
  await run("setMyShortDescription", {
    short_description: "⚔️ Build your Viking tribe, raid rivals and trade on a living world map. Play free in Telegram.",
  });
  await run("setMyDescription", {
    description:
      "⚔️ VALORIANS LEGEND ⚔️\n\n" +
      "Rise from a small village to a legendary Viking tribe.\n\n" +
      "🏰 Build and upgrade 24 buildings\n" +
      "⛏️ Mine resources every day\n" +
      "🗺️ March armies across a live world map\n" +
      "🤝 Trade with other chiefs\n" +
      "🛡️ Found or join a clan\n\n" +
      "Free to play, right here in Telegram. Tap START to claim your land!",
  });
  await run("setMyCommands", {
    commands: [
      { command: "start", description: "⚔️ Begin your legend" },
      { command: "play", description: "🎮 Open the game" },
      { command: "tribe", description: "🏰 Your tribe at a glance" },
      { command: "top", description: "🏆 Top chiefs" },
      { command: "clan", description: "🛡️ Your clan" },
      { command: "help", description: "📜 How to play" },
      { command: "plus", description: "👑 Valorians Plus" },
      { command: "news", description: "🔔 Update news on/off" },
    ],
  });
  // Admins also see the admin commands (/announce, /stats, /releases) in their own menu.
  for (const id of await adminIds()) {
    await run("setMyCommands", { scope: { type: "chat", chat_id: id }, commands: ADMIN_COMMANDS });
  }
  await run("setChatMenuButton", { menu_button: { type: "web_app", text: "Play", web_app: { url: base } } });
  await run("setWebhook", {
    url: `${base}/api/bot`,
    secret_token: webhookSecret(),
    allowed_updates: ALLOWED_UPDATES,
    drop_pending_updates: true,
  });

  return { app: base, steps };
}

/**
 * Runs setupBot when the bot isn't pointed at this app yet (first deploy, a
 * new token, someone reset it in BotFather). Cheap: one getWebhookInfo call,
 * at most once every 10 minutes per server instance.
 */
let lastCheck = 0;

export async function ensureBotSetup() {
  if (!botToken() || Date.now() - lastCheck < 10 * 60_000) return null;
  lastCheck = Date.now();
  const info = (await tg("getWebhookInfo", {})) as { ok: boolean; result?: { url?: string; allowed_updates?: string[] } };

  if (!info.ok) return null;
  // Also re-run when the webhook is missing an update kind added later (e.g. payments).
  const kinds = info.result?.allowed_updates ?? ["message", "callback_query"];
  const upToDate = info.result?.url === `${appUrl()}/api/bot` && ALLOWED_UPDATES.every((k) => kinds.includes(k));

  if (upToDate) return null;

  return setupBot();
}
