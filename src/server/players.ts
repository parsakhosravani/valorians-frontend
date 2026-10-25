import "server-only";

import crypto from "crypto";
import type { InStatement, Row } from "@libsql/client";

import { getDb } from "./db";
import type { AuthResult, TelegramAuthUser } from "./auth";

import { REFERRAL_REWARD } from "@/lib/game/config";
import { AvatarId, SHOWN_PHOTO_SQL, avatarSrc, isAvatarId } from "@/lib/game/avatars";
import { GameError, GameState, advance, createInitialState, normalizeState } from "@/lib/game/engine";
import { powerScore } from "@/lib/game/war";

/** Columns copied out of the state so they can be sorted and filtered in SQL. */
const stateColumns = (s: GameState) => [
  s.population,
  powerScore(s),
  s.war.attacksWon + s.war.defensesWon,
  s.shieldUntil,
];

export type Player = {
  id: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  /** The raw Telegram photo URL last checked (photoUrl is null if it was only a letter tile). */
  photoSrc: string | null;
  /** A portrait the player picked; null means use the Telegram photo. */
  avatar: AvatarId | null;
  isPremium: boolean;
  referralCode: string;
  referredBy: number | null;
  createdAt: number;
  version: number;
  state: GameState;
};

const str = (v: unknown) => (v == null ? null : String(v));

const toPlayer = (r: Row): Player => ({
  id: Number(r.id),
  username: str(r.username),
  firstName: String(r.first_name ?? ""),
  lastName: str(r.last_name),
  photoUrl: str(r.photo_url),
  photoSrc: str(r.photo_src),
  avatar: isAvatarId(r.avatar) ? r.avatar : null,
  isPremium: Number(r.is_premium) === 1,
  referralCode: String(r.referral_code),
  referredBy: r.referred_by == null ? null : Number(r.referred_by),
  createdAt: Number(r.created_at),
  version: Number(r.version),
  state: normalizeState(JSON.parse(String(r.state))),
});

export async function findById(id: number) {
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] });
  return rs.rows[0] ? toPlayer(rs.rows[0]) : null;
}

async function findIdByCode(code: string) {
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT id FROM users WHERE referral_code = ?", args: [code] });
  return rs.rows[0] ? Number(rs.rows[0].id) : null;
}

const newReferralCode = () =>
  crypto.randomBytes(9).toString("base64url").replace(/[-_]/g, "").slice(0, 8);

/**
 * Telegram always sends a photo URL, but when the picture is private or the
 * user has none it is a generated letter tile. Those are small SVGs with
 * text and no embedded image; treat them as "no photo" so the game shows its
 * own default avatar. Returns the URL to keep, or null.
 */
async function realPhoto(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(3000) });

    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";

    if (!type.includes("svg")) return url; // a real jpeg/png
    const body = await res.text();

    return /<image\b/i.test(body) ? url : null;
  } catch {
    return url; // can't tell; the client falls back if it fails to load
  }
}

const profileArgs = (u: TelegramAuthUser) => [
  u.username ?? null,
  u.first_name ?? "",
  u.last_name ?? null,
  u.photo_url ?? null,
  u.language_code ?? null,
  u.is_premium ? 1 : 0,
];

/** New players can still be linked to an inviter this long after they first played. */
const LATE_REFERRAL_MS = 48 * 3600 * 1000;

/** Links an existing new-ish player to their inviter and pays both sides once. */
async function linkLateReferral(player: Player, code: string, premium: boolean) {
  const inviterId = await findIdByCode(code);

  if (!inviterId || inviterId === player.id) return false;
  const inviter = await findById(inviterId);

  // No loops: you can't be invited by someone you invited.
  if (!inviter || inviter.referredBy === player.id) return false;
  const db = await getDb();
  const bonus = premium ? REFERRAL_REWARD.premiumCoins : REFERRAL_REWARD.coins;
  const credit = (id: number, coins: number, pop: number): InStatement => ({
    sql: `UPDATE users SET
            state = json_set(state,
              '$.coins', json_extract(state, '$.coins') + ?,
              '$.population', json_extract(state, '$.population') + ?),
            population = population + ?,
            version = version + 1
          WHERE id = ?`,
    args: [coins, pop, pop, id],
  });
  const claim = await db.execute({
    sql: "UPDATE users SET referred_by = ? WHERE id = ? AND referred_by IS NULL",
    args: [inviterId, player.id],
  });

  if (claim.rowsAffected !== 1) return false; // linked by a parallel request
  await db.batch([credit(player.id, bonus, 0), credit(inviterId, bonus, REFERRAL_REWARD.population)], "write");

  return true;
}

/** Loads the player, creating them (and paying referral bonuses) on first visit. */
export async function getOrCreatePlayer(auth: AuthResult, now: number): Promise<Player> {
  const db = await getDb();
  const existing = await findById(auth.user.id);

  if (existing) {
    const src = auth.user.photo_url ?? null;
    // Only re-check the picture when Telegram sends a different URL.
    const photo = src === existing.photoSrc ? existing.photoUrl : await realPhoto(auth.user.photo_url);
    const args = profileArgs(auth.user);

    args[3] = photo;
    await db.execute({
      sql: `UPDATE users SET username = ?, first_name = ?, last_name = ?, photo_url = ?,
              language_code = ?, is_premium = ?, last_seen_at = ?, photo_src = ? WHERE id = ?`,
      args: [...args, now, src, auth.user.id],
    });
    existing.photoUrl = photo;
    existing.photoSrc = src;
    if (auth.startParam && existing.referredBy == null && now - existing.createdAt < LATE_REFERRAL_MS) {
      // Opened the game once without the link (e.g. from the bot's menu
      // button), then came back through a friend's invite: still count it.
      if (await linkLateReferral(existing, auth.startParam, !!auth.user.is_premium)) return (await findById(existing.id))!;
    }
    return existing;
  }

  const state = createInitialState(now);
  const stmts: InStatement[] = [];
  let referredBy: number | null = null;

  const inviterId = auth.startParam ? await findIdByCode(auth.startParam) : null;
  if (inviterId && inviterId !== auth.user.id) {
    referredBy = inviterId;
    const bonus = auth.user.is_premium ? REFERRAL_REWARD.premiumCoins : REFERRAL_REWARD.coins;
    state.coins += bonus;
    // Credit the inviter atomically in SQL, so it can't clash with their own saves.
    stmts.push({
      sql: `UPDATE users SET
              state = json_set(state,
                '$.coins', json_extract(state, '$.coins') + ?,
                '$.population', json_extract(state, '$.population') + ?),
              population = population + ?,
              version = version + 1
            WHERE id = ?`,
      args: [bonus, REFERRAL_REWARD.population, REFERRAL_REWARD.population, inviterId],
    });
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const insert: InStatement = {
      sql: `INSERT INTO users (username, first_name, last_name, photo_url, language_code, is_premium,
              id, referral_code, referred_by, population, power, wins, shield_until, state, version,
              created_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      args: [
        ...profileArgs(auth.user),
        auth.user.id,
        newReferralCode(),
        referredBy,
        ...stateColumns(state),
        JSON.stringify(state),
        now,
        now,
      ],
    };
    try {
      // Insert first: if a parallel request already created this player, the
      // whole batch fails and the inviter isn't paid twice.
      await db.batch([insert, ...stmts], "write");
      break;
    } catch (e) {
      const msg = String((e as Error).message);
      if (/UNIQUE constraint failed: users\.id|PRIMARY KEY/i.test(msg)) break; // created concurrently
      if (/UNIQUE constraint failed: users\.referral_code/i.test(msg)) continue; // code clash, retry
      throw e;
    }
  }

  return (await findById(auth.user.id))!;
}

/**
 * Runs `fn` on the player's state brought up to `now` and saves the result.
 * Uses optimistic locking: if another request saved in between, it reloads and
 * runs `fn` again on the fresh state. Throws whatever `fn` throws, unsaved.
 */
export async function mutatePlayer(
  id: number,
  now: number,
  fn: (s: GameState) => GameState
): Promise<Player> {
  const db = await getDb();
  for (let attempt = 0; attempt < 8; attempt++) {
    const player = await findById(id);
    if (!player) throw new Error("Player not found");
    const next = fn(advance(player.state, now));
    const rs = await db.execute({
      sql: `UPDATE users SET state = ?, population = ?, power = ?, wins = ?, shield_until = ?,
              version = version + 1 WHERE id = ? AND version = ?`,
      args: [JSON.stringify(next), ...stateColumns(next), id, player.version],
    });
    if (rs.rowsAffected === 1) return { ...player, version: player.version + 1, state: next };
  }
  throw new Error("Too many simultaneous updates, try again");
}

/** The picture other players see: the picked portrait, else the Telegram photo. */
export const shownPhoto = (p: Pick<Player, "avatar" | "photoUrl">) => (p.avatar ? avatarSrc(p.avatar) : p.photoUrl);

/** Picks a portrait, or null to go back to the Telegram photo. */
export async function setAvatar(p: Player, avatar: unknown) {
  if (avatar != null && !isAvatarId(avatar)) throw new GameError("Unknown avatar");
  const db = await getDb();

  await db.execute({ sql: "UPDATE users SET avatar = ? WHERE id = ?", args: [avatar ?? null, p.id] });

  return { ...p, avatar: (avatar ?? null) as AvatarId | null };
}

export async function rankOf(population: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT COUNT(*) + 1 AS rank FROM users WHERE population > ?",
    args: [population],
  });
  return Number(rs.rows[0].rank);
}

export async function playerView(p: Player, now: number) {
  const inviter = p.referredBy ? await findById(p.referredBy) : null;

  return {
    serverTime: now,
    me: {
      id: p.id,
      username: p.username,
      firstName: p.firstName,
      lastName: p.lastName,
      photoUrl: shownPhoto(p),
      telegramPhotoUrl: p.photoUrl,
      avatar: p.avatar,
      referralCode: p.referralCode,
      invitedBy: inviter ? inviter.firstName || (inviter.username ? `@${inviter.username}` : "a friend") : null,
      rank: await rankOf(p.state.population),
    },
    state: p.state,
  };
}

export type PlayerView = Awaited<ReturnType<typeof playerView>>;

export async function listFriends(id: number) {
  const db = await getDb();
  const [count, rows] = await db.batch(
    [
      { sql: "SELECT COUNT(*) AS n FROM users WHERE referred_by = ?", args: [id] },
      {
        sql: `SELECT id, username, first_name, ${SHOWN_PHOTO_SQL}, is_premium, population, created_at
              FROM users WHERE referred_by = ? ORDER BY created_at DESC LIMIT 200`,
        args: [id],
      },
    ],
    "read"
  );
  return {
    total: Number(count.rows[0].n),
    friends: rows.rows.map((f) => {
      const premium = Number(f.is_premium) === 1;
      return {
        id: Number(f.id),
        name: String(f.first_name || f.username || "Player"),
        username: str(f.username),
        photoUrl: str(f.photo_url),
        isPremium: premium,
        population: Math.floor(Number(f.population)),
        bonusCoins: premium ? REFERRAL_REWARD.premiumCoins : REFERRAL_REWARD.coins,
        bonusPopulation: REFERRAL_REWARD.population,
        joinedAt: Number(f.created_at),
      };
    }),
  };
}
