import "server-only";

import { RANKS, RESOURCE_IDS, UNITS, unitPlural } from "@/lib/game/config";
import type { Army, BanditRaid, BanditRaidReport } from "@/lib/game/engine";
import type { Promotion, RaidReport } from "@/lib/game/war";
import type { Ambush } from "@/lib/game/bandits";
import { whole } from "@/lib/format";

/**
 * Battle news sent as Telegram messages from the bot, so players hear about
 * attacks while the game is closed. The bot can only message players who
 * started it or allowed it to write (the app asks once); other sends fail
 * quietly. Sending never blocks or breaks a game action.
 */

const token = () => process.env.TELEGRAM_BOT_TOKEN || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;

/** The game's address (the Mini App URL registered with BotFather). */
const appUrl = () => (process.env.APP_URL || "https://valorians-legend.vercel.app").replace(/\/$/, "");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = whole;

const armyText = (a: Army | null | undefined) => {
  if (!a) return "an army";
  const parts = UNITS.filter((u) => (a[u.id] ?? 0) > 0).map((u) => `${u.icon} ${fmt(a[u.id])}`);

  return parts.length ? parts.join("  ") : "nobody";
};

/** "\n\n🎖️ Your Spearmen are now Veterans!" for each regiment that went up a rank. */
const promotionText = (p: Promotion[] | undefined) =>
  p?.length
    ? "\n\n" + p.map((x) => `🎖️ Your ${unitPlural(x.unit)} are now <b>${RANKS[x.rank].name}s</b>!`).join("\n")
    : "";

const lootTotal = (r: RaidReport) => RESOURCE_IDS.reduce((s, k) => s + (r.loot[k] ?? 0), 0);

const inMinutes = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60000));

  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

/**
 * Sends one message with a button that opens the game on `path` (e.g. the
 * battle reports). It is a web_app button: in the bot's private chat it opens
 * the Mini App directly. (t.me links back into the same bot often did nothing
 * when tapped.) Resolves even on failure.
 */
export async function sendToPlayer(userId: number, html: string, button = "⚔️ Open Valorians", path = "/hall") {
  const t = token();

  if (!t || process.env.NOTIFICATIONS === "off") return;

  try {
    await fetch(`${process.env.TELEGRAM_API_BASE || "https://api.telegram.org"}/bot${t}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({
        chat_id: userId,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: { inline_keyboard: [[{ text: button, web_app: { url: `${appUrl()}${path}` } }]] },
      }),
    });
  } catch {
    // Offline bot, blocked bot or never started: the game carries on.
  }
}

// ─── Messages ────────────────────────────────────────────────────────────────

export const notify = {
  clanRequest(officerId: number, chief: string, clan: string) {
    return sendToPlayer(
      officerId,
      `🛡️ <b>${esc(chief)}</b> asks to join <b>${esc(clan)}</b>.`,
      "🛡️ Review request",
      "/clan"
    );
  },

  clanAccepted(userId: number, clan: string) {
    return sendToPlayer(userId, `🎉 You were accepted into <b>${esc(clan)}</b>! Your clan's perks now apply.`, "🛡️ Open clan", "/clan");
  },

  incoming(defenderId: number, attacker: string, units: Army | null, travelMs: number) {
    return sendToPlayer(
      defenderId,
      `🔥 <b>${esc(attacker)}</b> is marching on your tribe!\n\n` +
        `Army: ${armyText(units)}${units ? "" : " (build a Watchtower to see which troops)"}\n` +
        `Arrives in <b>${inMinutes(travelMs)}</b>. Train defenders or upgrade your walls now.`,
      "🛡️ Prepare defenses",
      "/battle?tab=army"
    );
  },

  battleBegun(defenderId: number, attacker: string, durationMs: number) {
    return sendToPlayer(
      defenderId,
      `⚔️ <b>${esc(attacker)}</b> is at your walls! Your troops are on the field.\n\n` +
        `The battle lasts <b>${inMinutes(durationMs)}</b>. Watch it on the map.`,
      "🗺️ Watch the battle",
      "/battle?tab=map"
    );
  },

  defended(defenderId: number, attacker: string, r: RaidReport) {
    return sendToPlayer(
      defenderId,
      `🛡️ <b>You held off ${esc(attacker)}!</b>\n\n` +
        `Their attack ${fmt(r.attack)} vs your defense ${fmt(r.defense)}.\n` +
        `They lost: ${armyText(r.attackerLosses)}\nYou lost: ${armyText(r.defenderLosses)}` +
        promotionText(r.defenderPromoted),
      "📜 See the report",
      "/battle?tab=reports"
    );
  },

  raided(defenderId: number, attacker: string, r: RaidReport, attackerId?: number) {
    const taken = lootTotal(r);

    return sendToPlayer(
      defenderId,
      // Nothing taken (all of it hidden in the Hideout, or no room to carry more): say so, not "took 0".
      (taken > 0
        ? `💀 <b>${esc(attacker)} raided your tribe</b> and took ${fmt(taken)} resources.\n\n`
        : `💀 <b>${esc(attacker)} beat your defenders</b>, but your stores were safe: they carried nothing off.\n\n`) +
        `Their attack ${fmt(r.attack)} vs your defense ${fmt(r.defense)}.\n` +
        `You lost: ${armyText(r.defenderLosses)}\n` +
        (r.gate ? `🚪 Your City Gate was knocked down from level ${r.gate.from} to ${r.gate.to}.\n` : "") +
        `You're shielded for ${Math.round((r.shieldMs ?? 2 * 3600e3) / 3600e3)} hours. Time for revenge?` +
        promotionText(r.defenderPromoted),
      "⚔️ Take revenge",
      attackerId ? `/battle?revenge=${attackerId}` : "/battle?tab=reports"
    );
  },

  attackResult(attackerId: number, target: string, r: RaidReport, now: number) {
    const home = Math.max(0, r.returnsAt - now);

    return r.attackerWon
      ? sendToPlayer(
          attackerId,
          `🏆 <b>Victory at ${esc(target)}!</b>\n\n` +
            `Loot: ${fmt(lootTotal(r))} resources${r.coins ? ` + ${fmt(r.coins)} coins` : ""}\n` +
            `Lost: ${armyText(r.attackerLosses)}\nYour army is home in ${inMinutes(home)}.` +
            promotionText(r.attackerPromoted),
          "📜 See the report",
          "/battle?tab=reports"
        )
      : sendToPlayer(
          attackerId,
          `💀 <b>Defeat at ${esc(target)}.</b>\n\n` +
            `Your attack ${fmt(r.attack)} vs their defense ${fmt(r.defense)}.\n` +
            `Lost: ${armyText(r.attackerLosses)}\nScout first and bring more troops next time.` +
            promotionText(r.attackerPromoted),
          "📜 See the report",
          "/battle?tab=reports"
        );
  },

  tradeAccepted(
    sellerId: number,
    buyer: string,
    t: { give: string; giveAmount: number; want: string; wantAmount: number },
    travelMs: number
  ) {
    return sendToPlayer(
      sellerId,
      `🤝 <b>${esc(buyer)}</b> took your offer: ${fmt(t.giveAmount)} ${t.give} for ${fmt(t.wantAmount)} ${t.want}.\n\n` +
        `Merchants arrive with your ${t.want} in <b>${inMinutes(travelMs)}</b>.`,
      "🤝 Open my trades",
      "/market?tab=mine"
    );
  },

  calledOff(defenderId: number, attacker: string) {
    return sendToPlayer(
      defenderId,
      `🏳️ <b>${esc(attacker)}</b>'s army turned away from your tribe and marched on another target.`,
      "🗺️ See the map",
      "/battle?tab=map"
    );
  },

  /** Bandits jumped one of your armies on the road. */
  ambushed(attackerId: number, target: string, a: Ambush) {
    const dead = armyText(a.lost);
    const lost = UNITS.some((u) => (a.lost[u.id] ?? 0) > 0);
    const spoils = RESOURCE_IDS.reduce((n, r) => n + (a.loot?.[r] ?? 0), 0) + (a.coins ?? 0);

    return sendToPlayer(
      attackerId,
      (a.won
        ? `🗡️ <b>Bandits ambushed your army</b> on the way to ${esc(target)}. Your troops drove them off.`
        : `🗡️ <b>Bandits ambushed your army</b> on the way to ${esc(target)} and got the better of it.`) +
        (lost ? `\n\nFallen: ${dead}` : "") +
        (spoils > 0 ? `\nThe bandits made off with <b>${fmt(spoils)}</b> of the spoils.` : "") +
        `\n\nThe survivors march on. Clear the lair to make that road safe.`,
      "🗺️ Open the map",
      "/battle?tab=map"
    );
  },

  /** Bandits are gathering to raid the village. */
  banditsGathering(userId: number, raid: BanditRaid, defense: number) {
    const hours = Math.round((raid.arrivesAt - raid.warnedAt) / 3600e3);

    return sendToPlayer(
      userId,
      `🗡️ <b>Bandits are gathering to raid your village!</b>\n\n` +
        `A band about <b>${fmt(raid.strength)}</b> strong is massing at their lair (${raid.x}, ${raid.y}). ` +
        `Your defense is ${fmt(defense)}. They strike in about ${hours} hours.\n\n` +
        `Train defenders, or clear their lair first to call the raid off.`,
      "🗺️ Open the map",
      "/battle?tab=map"
    );
  },

  /** How a bandit raid on the village went. */
  banditRaidResult(userId: number, r: BanditRaidReport) {
    const taken = RESOURCE_IDS.reduce((n, k) => n + r.stolen[k], 0);
    const fallen = UNITS.some((u) => (r.defenderLosses[u.id] ?? 0) > 0) ? `\nFallen: ${armyText(r.defenderLosses)}` : "";
    const text =
      r.outcome === "foiled"
        ? "🏚️ <b>The bandit raid is off:</b> their lair was cleared before they could strike."
        : r.outcome === "won"
          ? `🛡️ <b>Your village beat off the bandits!</b>\n\nTheir ${fmt(r.strength)} against your ${fmt(r.defense)}.${fallen}\n` +
            `Their lair is cleared, and you took its bounty: ${fmt(r.bounty?.resources ?? 0)} of each resource and ${fmt(r.bounty?.coins ?? 0)} coins.`
          : `🗡️ <b>Bandits raided your village</b> and carried off ${fmt(taken)} resources.\n\nTheir ${fmt(r.strength)} against your ${fmt(r.defense)}.${fallen}`;

    return sendToPlayer(userId, text, "🏰 Open the Hall", "/hall");
  },

  /** Bandits robbed the merchants bringing you goods. */
  robbed(receiverId: number, resource: string, stolen: number, delivered: number, from: string) {
    return sendToPlayer(
      receiverId,
      `🗡️ <b>Bandits robbed your merchants</b> on the road from ${esc(from)}: <b>${fmt(stolen)} ${resource}</b> is gone. ` +
        `The other ${fmt(delivered)} is still on its way.\n\nHire guards for your next trade, or clear the lair on that road.`,
      "🤝 Open my trades",
      "/market?tab=mine"
    );
  },

  /** The army reached a lair someone else had already cleared. */
  lairEmpty(attackerId: number) {
    return sendToPlayer(
      attackerId,
      "🏚️ Your army reached the bandit lair, but someone had already driven the bandits out. It's marching home.",
      "🗺️ Open the map",
      "/battle?tab=map"
    );
  },

  turnedBack(attackerId: number, target: string) {
    return sendToPlayer(
      attackerId,
      `🛡️ <b>${esc(target)}</b> was shielded when your army arrived, so it turned back home.`,
      "🗺️ Find another target",
      "/battle?tab=map"
    );
  },
};
