import "server-only";

import crypto from "crypto";

import { getDb } from "./db";
import { findById, rankOf } from "./players";
import { displayName } from "./war";

import { REFERRAL_REWARD, RESOURCE_IDS, RESOURCE_NAMES, START, questUrl } from "@/lib/game/config";
import { advance } from "@/lib/game/engine";
import { powerScore } from "@/lib/game/war";

/**
 * The @valorians_bot chat: welcome, commands and buttons around the game.
 * Telegram calls POST /api/bot (webhook) for every message and button tap;
 * /api/bot/setup sets the bot's profile texts, command menu and Play button.
 */

const API = () => process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
export const botToken = () => process.env.TELEGRAM_BOT_TOKEN || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || "";

/** Secrets derived from the bot token, so no extra env vars are needed. */
const derive = (purpose: string) =>
  crypto.createHash("sha256").update(`${botToken()}:${purpose}`).digest("hex").slice(0, 32);
export const webhookSecret = () => derive("webhook");
export const setupKey = () => derive("setup");

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

const BOT = () => process.env.NEXT_PUBLIC_BOT_ADDRESS || "valorians_bot";
const SHORT = () => process.env.NEXT_PUBLIC_APP_SHORT_NAME || "start";
export const appUrl = () => (process.env.APP_URL || "https://valorians-legend.vercel.app").replace(/\/$/, "");

/** Opens the Mini App; `param` reaches the game as start_param (referral codes). */
const playLink = (param?: string) => `https://t.me/${BOT()}/${SHORT()}${param ? `?startapp=${encodeURIComponent(param)}` : ""}`;

type Button = { text: string; url?: string; callback_data?: string; web_app?: { url: string } };

/** In the bot's own chat a web_app button opens the game in place; links carry referral codes. */
const playButton = (text = "⚔️ Play Valorians", param?: string): Button =>
  param ? { text, url: playLink(param) } : { text, web_app: { url: appUrl() } };

const channel = () => questUrl("telegram", process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL);

const menuRows = (): Button[][] => [
  [
    { text: "🏰 My tribe", callback_data: "tribe" },
    { text: "🏆 Top chiefs", callback_data: "top" },
  ],
  [
    { text: "👥 Invite friends", callback_data: "invite" },
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

async function welcome(chatId: number, firstName: string, param?: string) {
  const invited = !!param;
  const caption =
    `⚔️ <b>Welcome to Valorians Legend, ${esc(firstName || "chief")}!</b>\n\n` +
    `The longships are ready and the dragons are restless. Raise your village, ` +
    `train an army and write your name into the sagas.\n\n` +
    `🏰 Build and upgrade 24 buildings\n` +
    `⛏️ Mine resources every day\n` +
    `🗺️ March armies across a live world map\n` +
    `🤝 Trade with other chiefs on the Market\n\n` +
    `🎁 <b>Starter gift:</b> ${fmt(START.coins)} coins and ${fmt(START.resources)} of every resource` +
    (invited ? `\n🤝 <b>A friend invited you</b>: you both get a bonus when you start playing.` : "") +
    `\n\nTap <b>Play</b> to claim your land.`;
  const rows = [[playButton("⚔️ Play now", param)], ...menuRows()];
  const photo = await tg("sendPhoto", {
    chat_id: chatId,
    photo: `${appUrl()}/bot/welcome.jpg`,
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
      `<b>3. Train an army.</b> Spearmen hold the line, archers hit hard, cavalry ride fast, rams break walls.\n\n` +
      `<b>4. Conquer the map.</b> Raid barbarian camps and rival tribes. Armies take time to march, so plan your strikes. ` +
      `Hills and forests help defenders; scout before you attack.\n\n` +
      `<b>5. Trade.</b> Build a Trading Post and swap your extra resources with other chiefs.\n\n` +
      `<b>6. Rise.</b> Climb the leaderboard by population, power and victories. Claim your login streak every day!`,
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
  const rank = await rankOf(s.population);
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

async function invite(chatId: number, userId: number) {
  const p = await findById(userId);

  if (!p) {
    await send(chatId, `Start playing first, then come back for your personal invite link.`, [[playButton()]]);

    return;
  }
  const link = playLink(p.referralCode);
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(
    "⚔️ Join my tribe in Valorians Legend! Build, raid and trade right inside Telegram."
  )}`;

  await send(
    chatId,
    `👥 <b>Invite friends, grow stronger</b>\n\n` +
      `For every friend who starts playing with your link:\n` +
      `🪙 +${fmt(REFERRAL_REWARD.coins)} coins for you and for them (+${fmt(REFERRAL_REWARD.premiumCoins)} if they have Telegram Premium)\n` +
      `👥 +${fmt(REFERRAL_REWARD.population)} population for you\n\n` +
      `Your link:\n<code>${link}</code>`,
    [[{ text: "📨 Share with friends", url: share }], [{ text: "« Menu", callback_data: "menu" }]]
  );
}

async function menu(chatId: number) {
  await send(chatId, `⚔️ <b>Valorians Legend</b>\n\nWhat would you like to do, chief?`, [[playButton()], ...menuRows()]);
}

// ─── Webhook entry ───────────────────────────────────────────────────────────

type Update = {
  message?: { chat: { id: number; type: string }; from?: { id: number; first_name?: string }; text?: string };
  callback_query?: { id: string; from: { id: number; first_name?: string }; message?: { chat: { id: number } }; data?: string };
};

export async function handleUpdate(u: Update) {
  if (u.callback_query) {
    const q = u.callback_query;
    const chatId = q.message?.chat.id ?? q.from.id;

    await tg("answerCallbackQuery", { callback_query_id: q.id });
    await route(q.data ?? "menu", chatId, q.from.id, q.from.first_name ?? "");

    return;
  }
  const m = u.message;

  if (!m?.text || !m.from || m.chat.type !== "private") return;
  const [cmd, ...rest] = m.text.trim().split(/\s+/);
  const name = cmd.replace(/^\//, "").replace(/@.*$/, "").toLowerCase();

  if (name === "start") return welcome(m.chat.id, m.from.first_name ?? "", rest[0]);

  return route(name, m.chat.id, m.from.id, m.from.first_name ?? "");
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
    case "invite":
    case "friends":
      return invite(chatId, userId);
    case "help":
      return howToPlay(chatId);
    default:
      return menu(chatId);
  }
}

// ─── One-time setup: profile texts, command menu, Play button, webhook ──────

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
      "👥 Invite friends for bonus coins\n\n" +
      "Free to play, right here in Telegram. Tap START to claim your land!",
  });
  await run("setMyCommands", {
    commands: [
      { command: "start", description: "⚔️ Begin your legend" },
      { command: "play", description: "🎮 Open the game" },
      { command: "tribe", description: "🏰 Your tribe at a glance" },
      { command: "top", description: "🏆 Top chiefs" },
      { command: "invite", description: "👥 Invite friends, earn coins" },
      { command: "help", description: "📜 How to play" },
    ],
  });
  await run("setChatMenuButton", { menu_button: { type: "web_app", text: "Play", web_app: { url: base } } });
  await run("setWebhook", {
    url: `${base}/api/bot`,
    secret_token: webhookSecret(),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });

  return { app: base, steps };
}
