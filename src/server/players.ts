import "server-only";

import crypto from "crypto";
import type { InStatement, Row } from "@libsql/client";

import { getDb } from "./db";
import type { AuthResult, TelegramAuthUser } from "./auth";

import { REFERRAL_REWARD } from "@/lib/game/config";
import { GameState, advance, createInitialState, normalizeState } from "@/lib/game/engine";

export type Player = {
  id: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  isPremium: boolean;
  referralCode: string;
  referredBy: number | null;
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
  isPremium: Number(r.is_premium) === 1,
  referralCode: String(r.referral_code),
  referredBy: r.referred_by == null ? null : Number(r.referred_by),
  version: Number(r.version),
  state: normalizeState(JSON.parse(String(r.state))),
});

async function findById(id: number) {
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

const profileArgs = (u: TelegramAuthUser) => [
  u.username ?? null,
  u.first_name ?? "",
  u.last_name ?? null,
  u.photo_url ?? null,
  u.language_code ?? null,
  u.is_premium ? 1 : 0,
];

/** Loads the player, creating them (and paying referral bonuses) on first visit. */
export async function getOrCreatePlayer(auth: AuthResult, now: number): Promise<Player> {
  const db = await getDb();
  const existing = await findById(auth.user.id);

  if (existing) {
    await db.execute({
      sql: `UPDATE users SET username = ?, first_name = ?, last_name = ?, photo_url = ?,
              language_code = ?, is_premium = ?, last_seen_at = ? WHERE id = ?`,
      args: [...profileArgs(auth.user), now, auth.user.id],
    });
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
              id, referral_code, referred_by, population, state, version, created_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      args: [
        ...profileArgs(auth.user),
        auth.user.id,
        newReferralCode(),
        referredBy,
        state.population,
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
      sql: "UPDATE users SET state = ?, population = ?, version = version + 1 WHERE id = ? AND version = ?",
      args: [JSON.stringify(next), next.population, id, player.version],
    });
    if (rs.rowsAffected === 1) return { ...player, version: player.version + 1, state: next };
  }
  throw new Error("Too many simultaneous updates, try again");
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
  return {
    serverTime: now,
    me: {
      id: p.id,
      username: p.username,
      firstName: p.firstName,
      lastName: p.lastName,
      photoUrl: p.photoUrl,
      referralCode: p.referralCode,
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
        sql: `SELECT id, username, first_name, photo_url, is_premium, population, created_at
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
