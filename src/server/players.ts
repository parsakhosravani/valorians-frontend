import "server-only";

import crypto from "crypto";

import { db } from "./db";
import type { AuthResult, TelegramAuthUser } from "./auth";

import { REFERRAL_REWARD } from "@/lib/game/config";
import { GameState, advance, createInitialState, normalizeState } from "@/lib/game/engine";

type UserRow = {
  id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  is_premium: number;
  referral_code: string;
  referred_by: number | null;
  population: number;
  state: string;
  created_at: number;
  last_seen_at: number;
};

export type Player = {
  id: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  isPremium: boolean;
  referralCode: string;
  referredBy: number | null;
  state: GameState;
};

const toPlayer = (r: UserRow): Player => ({
  id: r.id,
  username: r.username,
  firstName: r.first_name,
  lastName: r.last_name,
  photoUrl: r.photo_url,
  isPremium: !!r.is_premium,
  referralCode: r.referral_code,
  referredBy: r.referred_by,
  state: normalizeState(JSON.parse(r.state)),
});

const selectById = db.prepare<[number], UserRow>("SELECT * FROM users WHERE id = ?");
const selectByCode = db.prepare<[string], UserRow>("SELECT * FROM users WHERE referral_code = ?");
const insertUser = db.prepare(`
  INSERT INTO users (id, username, first_name, last_name, photo_url, language_code, is_premium,
                     referral_code, referred_by, population, state, created_at, last_seen_at)
  VALUES (@id, @username, @first_name, @last_name, @photo_url, @language_code, @is_premium,
          @referral_code, @referred_by, @population, @state, @now, @now)
`);
const updateProfile = db.prepare(`
  UPDATE users SET username = @username, first_name = @first_name, last_name = @last_name,
    photo_url = @photo_url, language_code = @language_code, is_premium = @is_premium, last_seen_at = @now
  WHERE id = @id
`);
const updateState = db.prepare("UPDATE users SET state = ?, population = ? WHERE id = ?");
const rankQuery = db.prepare<[number], { rank: number }>(
  "SELECT COUNT(*) + 1 AS rank FROM users WHERE population > ?"
);

function newReferralCode() {
  for (;;) {
    const code = crypto.randomBytes(6).toString("base64url").replace(/[-_]/g, "").slice(0, 8);
    if (code.length === 8 && !selectByCode.get(code)) return code;
  }
}

function save(id: number, state: GameState) {
  updateState.run(JSON.stringify(state), state.population, id);
}

const profileParams = (u: TelegramAuthUser, now: number) => ({
  id: u.id,
  username: u.username ?? null,
  first_name: u.first_name ?? "",
  last_name: u.last_name ?? null,
  photo_url: u.photo_url ?? null,
  language_code: u.language_code ?? null,
  is_premium: u.is_premium ? 1 : 0,
  now,
});

/** Loads the player, creating them (and paying referral bonuses) on first visit. */
export const getOrCreatePlayer = db.transaction((auth: AuthResult, now: number): Player => {
  const existing = selectById.get(auth.user.id);
  if (existing) {
    updateProfile.run(profileParams(auth.user, now));
    return toPlayer({ ...existing });
  }

  const state = createInitialState(now);
  let referredBy: number | null = null;

  const inviterRow = auth.startParam ? selectByCode.get(auth.startParam) : undefined;
  if (inviterRow && inviterRow.id !== auth.user.id) {
    referredBy = inviterRow.id;
    const bonus = auth.user.is_premium ? REFERRAL_REWARD.premiumCoins : REFERRAL_REWARD.coins;
    const inviter = advance(toPlayer(inviterRow).state, now);
    inviter.coins += bonus;
    inviter.population += REFERRAL_REWARD.population;
    save(inviterRow.id, inviter);
    state.coins += bonus;
  }

  insertUser.run({
    ...profileParams(auth.user, now),
    referral_code: newReferralCode(),
    referred_by: referredBy,
    population: state.population,
    state: JSON.stringify(state),
  });
  return toPlayer(selectById.get(auth.user.id)!);
});

/**
 * Runs `fn` on the player's state brought up to `now`, inside a transaction,
 * and saves what it returns. Throws whatever `fn` throws without saving.
 */
export const mutatePlayer = db.transaction(
  (id: number, now: number, fn: (s: GameState) => GameState): Player => {
    const row = selectById.get(id);
    if (!row) throw new Error("Player not found");
    const player = toPlayer(row);
    const next = fn(advance(player.state, now));
    save(id, next);
    return { ...player, state: next };
  }
);

export const rankOf = (population: number) => rankQuery.get(population)!.rank;

export function playerView(p: Player, now: number) {
  return {
    serverTime: now,
    me: {
      id: p.id,
      username: p.username,
      firstName: p.firstName,
      lastName: p.lastName,
      photoUrl: p.photoUrl,
      referralCode: p.referralCode,
      rank: rankOf(p.state.population),
    },
    state: p.state,
  };
}

export type PlayerView = ReturnType<typeof playerView>;

const friendsQuery = db.prepare<
  [number],
  Pick<UserRow, "id" | "username" | "first_name" | "photo_url" | "is_premium" | "population" | "created_at">
>(
  `SELECT id, username, first_name, photo_url, is_premium, population, created_at
   FROM users WHERE referred_by = ? ORDER BY created_at DESC LIMIT 200`
);
const friendsCount = db.prepare<[number], { n: number }>("SELECT COUNT(*) AS n FROM users WHERE referred_by = ?");

export function listFriends(id: number) {
  return {
    total: friendsCount.get(id)!.n,
    friends: friendsQuery.all(id).map((f) => ({
      id: f.id,
      name: f.first_name || f.username || "Player",
      username: f.username,
      photoUrl: f.photo_url,
      isPremium: !!f.is_premium,
      population: Math.floor(f.population),
      bonusCoins: f.is_premium ? REFERRAL_REWARD.premiumCoins : REFERRAL_REWARD.coins,
      bonusPopulation: REFERRAL_REWARD.population,
      joinedAt: f.created_at,
    })),
  };
}
