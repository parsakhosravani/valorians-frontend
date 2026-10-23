import "server-only";

import crypto from "crypto";

export type TelegramAuthUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
  is_premium?: boolean;
};

export type AuthResult = { user: TelegramAuthUser; startParam?: string };

export class AuthError extends Error {}

/** How old Telegram launch data may be before we refuse it. */
const MAX_AGE_SECONDS = Number(process.env.TELEGRAM_AUTH_MAX_AGE ?? 24 * 60 * 60);

/**
 * Verifies Telegram Mini App launch data (window.Telegram.WebApp.initData).
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(initData: string, botToken: string, now = Date.now()): AuthResult {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new AuthError("Missing hash");
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new AuthError("Invalid signature");
  }

  const authDate = Number(params.get("auth_date"));
  if (!authDate || now / 1000 - authDate > MAX_AGE_SECONDS) {
    throw new AuthError("Launch data expired, reopen the app");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new AuthError("Missing user");
  const user = JSON.parse(rawUser) as TelegramAuthUser;
  if (typeof user.id !== "number") throw new AuthError("Bad user");

  return { user, startParam: params.get("start_param") ?? undefined };
}

export const devLoginEnabled = () => process.env.NEXT_PUBLIC_DEV_LOGIN === "true";

/**
 * Reads the Authorization header:
 *   `tma <initData>`  – real Telegram launch data (always accepted)
 *   `dev <id>[:<startParam>]` – fake user, only when NEXT_PUBLIC_DEV_LOGIN=true
 */
export function authenticate(header: string | null): AuthResult {
  if (!header) throw new AuthError("Not signed in");
  const space = header.indexOf(" ");
  const scheme = header.slice(0, space);
  const value = header.slice(space + 1);

  if (scheme === "tma") {
    // Older deployments stored the token as NEXT_PUBLIC_TELEGRAM_BOT_TOKEN; accept
    // it so they keep working, but move it to TELEGRAM_BOT_TOKEN (server-only).
    const token = process.env.TELEGRAM_BOT_TOKEN || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
    if (!token) throw new AuthError("Server is missing TELEGRAM_BOT_TOKEN");
    return verifyInitData(value, token);
  }

  if (scheme === "dev" && devLoginEnabled()) {
    const [idPart, startParam] = value.split(":");
    const id = Number(idPart);
    if (!Number.isSafeInteger(id) || id <= 0) throw new AuthError("Bad dev id");
    return {
      user: { id, first_name: `Player ${id}`, username: `player${id}` },
      startParam: startParam || undefined,
    };
  }

  throw new AuthError("Not signed in");
}
