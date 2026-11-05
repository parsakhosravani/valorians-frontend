/**
 * Replaces src/server/auth.ts in the mirror. Telegram Serverless verifies the
 * Mini App's init data before our endpoint runs, so there is no HMAC to check
 * here: entry.ts passes the already-verified user in as `tgcloud <json>`.
 * Clients can't forge that header: endpoint callers only control the body.
 */
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

export function verifyInitData(): AuthResult {
  throw new AuthError("Not used on Telegram Serverless");
}

export function authenticate(header: string | null): AuthResult {
  if (!header?.startsWith("tgcloud ")) throw new AuthError("Unauthorized");
  const out = JSON.parse(header.slice("tgcloud ".length)) as AuthResult;

  if (typeof out?.user?.id !== "number") throw new AuthError("Bad user");

  return out;
}
