import "server-only";

/**
 * Checks channel membership with the Bot API. Returns null when it can't be
 * checked (no channel configured, or the bot isn't an admin there), so the
 * quest falls back to the timed check instead of blocking players.
 */
export async function isChannelMember(userId: number): Promise<boolean | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !chat) return null;
  try {
    const url = `https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(chat)}&user_id=${userId}`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    if (!data.ok) return null;
    return ["creator", "administrator", "member", "restricted"].includes(data.result.status);
  } catch {
    return null;
  }
}
