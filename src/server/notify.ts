import "server-only";

import { RESOURCE_IDS, UNITS } from "@/lib/game/config";
import type { Army } from "@/lib/game/engine";
import type { RaidReport } from "@/lib/game/war";

/**
 * Battle news sent as Telegram messages from the bot, so players hear about
 * attacks while the game is closed. The bot can only message players who
 * started it or allowed it to write (the app asks once); other sends fail
 * quietly. Sending never blocks or breaks a game action.
 */

const token = () => process.env.TELEGRAM_BOT_TOKEN || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;

const appLink = (param?: string) => {
  const bot = process.env.NEXT_PUBLIC_BOT_ADDRESS;
  const app = process.env.NEXT_PUBLIC_APP_SHORT_NAME || "start";

  return bot ? `https://t.me/${bot}/${app}${param ? `?startapp=${param}` : ""}` : null;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

const armyText = (a: Army | null | undefined) => {
  if (!a) return "an army";
  const parts = UNITS.filter((u) => (a[u.id] ?? 0) > 0).map((u) => `${u.icon} ${fmt(a[u.id])}`);

  return parts.length ? parts.join("  ") : "nobody";
};

const lootTotal = (r: RaidReport) => RESOURCE_IDS.reduce((s, k) => s + (r.loot[k] ?? 0), 0);

const inMinutes = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60000));

  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

/** Sends one message. Resolves even on failure. */
export async function sendToPlayer(userId: number, html: string, button = "⚔️ Open Valorians", param?: string) {
  const t = token();

  if (!t || process.env.NOTIFICATIONS === "off") return;
  const link = appLink(param);

  try {
    await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({
        chat_id: userId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(link ? { reply_markup: { inline_keyboard: [[{ text: button, url: link }]] } } : {}),
      }),
    });
  } catch {
    // Offline bot, blocked bot or never started: the game carries on.
  }
}

// ─── Messages ────────────────────────────────────────────────────────────────

export const notify = {
  incoming(defenderId: number, attacker: string, units: Army | null, travelMs: number) {
    return sendToPlayer(
      defenderId,
      `🔥 <b>${esc(attacker)}</b> is marching on your tribe!\n\n` +
        `Army: ${armyText(units)}${units ? "" : " (build a Watchtower to see which troops)"}\n` +
        `Arrives in <b>${inMinutes(travelMs)}</b>. Train defenders or upgrade your walls now.`,
      "🛡️ Prepare defenses"
    );
  },

  defended(defenderId: number, attacker: string, r: RaidReport) {
    return sendToPlayer(
      defenderId,
      `🛡️ <b>You held off ${esc(attacker)}!</b>\n\n` +
        `Their attack ${fmt(r.attack)} vs your defense ${fmt(r.defense)}.\n` +
        `They lost: ${armyText(r.attackerLosses)}\nYou lost: ${armyText(r.defenderLosses)}`,
      "📜 See the report"
    );
  },

  raided(defenderId: number, attacker: string, r: RaidReport) {
    return sendToPlayer(
      defenderId,
      `💀 <b>${esc(attacker)} raided your tribe</b> and took ${fmt(lootTotal(r))} resources.\n\n` +
        `Their attack ${fmt(r.attack)} vs your defense ${fmt(r.defense)}.\n` +
        `You lost: ${armyText(r.defenderLosses)}\nYou're shielded for 2 hours. Time for revenge?`,
      "⚔️ Take revenge"
    );
  },

  attackResult(attackerId: number, target: string, r: RaidReport, now: number) {
    const home = Math.max(0, r.returnsAt - now);

    return r.attackerWon
      ? sendToPlayer(
          attackerId,
          `🏆 <b>Victory at ${esc(target)}!</b>\n\n` +
            `Loot: ${fmt(lootTotal(r))} resources${r.coins ? ` + ${fmt(r.coins)} coins` : ""}\n` +
            `Lost: ${armyText(r.attackerLosses)}\nYour army is home in ${inMinutes(home)}.`,
          "📜 See the report"
        )
      : sendToPlayer(
          attackerId,
          `💀 <b>Defeat at ${esc(target)}.</b>\n\n` +
            `Your attack ${fmt(r.attack)} vs their defense ${fmt(r.defense)}.\n` +
            `Lost: ${armyText(r.attackerLosses)}\nScout first and bring more troops next time.`,
          "⚔️ Back to war"
        );
  },

  turnedBack(attackerId: number, target: string) {
    return sendToPlayer(
      attackerId,
      `🛡️ <b>${esc(target)}</b> was shielded when your army arrived, so it turned back home.`,
      "⚔️ Find another target"
    );
  },
};
