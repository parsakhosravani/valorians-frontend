import "server-only";

import crypto from "crypto";
import type { InStatement, Row } from "@libsql/client";

import { getDb } from "./db";
import type { AuthResult, TelegramAuthUser } from "./auth";

import { GameState, advance, createInitialState, normalizeState } from "@/lib/game/engine";
import { powerScore } from "@/lib/game/war";
import { storedFlag } from "@/lib/game/clan";
import { plusPrice } from "./plus";

/** Columns copied out of the state so they can be sorted and filtered in SQL. */
const stateColumns = (s: GameState) => [
  s.population,
  powerScore(s),
  s.war.attacksWon + s.war.defensesWon,
  s.shieldUntil,
  s.plus?.until ?? 0,
];

export type Player = {
  id: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  /** The raw Telegram photo URL last checked (photoUrl is null if it was only a letter tile). */
  photoSrc: string | null;
  isPremium: boolean;
  languageCode: string | null;
  lastSeenAt: number;
  clanId: number | null;
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
  isPremium: Number(r.is_premium) === 1,
  languageCode: str(r.language_code),
  lastSeenAt: Number(r.last_seen_at ?? 0),
  clanId: r.clan_id == null ? null : Number(r.clan_id),
  createdAt: Number(r.created_at),
  version: Number(r.version),
  state: normalizeState(JSON.parse(String(r.state))),
});

export async function findById(id: number) {
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] });
  return rs.rows[0] ? toPlayer(rs.rows[0]) : null;
}

/** Value for the old (still NOT NULL UNIQUE) referral_code column. Unused by the game. */
const newLegacyCode = () =>
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

const LAST_SEEN_PRECISION_MS = 10 * 60_000;

/** Loads the player, creating them on first visit. */
export async function getOrCreatePlayer(auth: AuthResult, now: number): Promise<Player> {
  const db = await getDb();
  const existing = await findById(auth.user.id);

  if (existing) {
    const src = auth.user.photo_url ?? null;
    const u = auth.user;
    const unchanged =
      (u.username ?? null) === existing.username &&
      (u.first_name ?? "") === existing.firstName &&
      (u.last_name ?? null) === existing.lastName &&
      (u.language_code ?? null) === existing.languageCode &&
      !!u.is_premium === existing.isPremium &&
      src === existing.photoSrc;

    // Every request used to rewrite the profile. Skip the write when nothing
    // changed and last_seen_at is recent enough (it's only a rough "last seen").
    if (unchanged && now - existing.lastSeenAt < LAST_SEEN_PRECISION_MS) return existing;
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
    existing.lastSeenAt = now;

    return existing;
  }

  const state = createInitialState(now);

  for (let attempt = 0; attempt < 5; attempt++) {
    const insert: InStatement = {
      sql: `INSERT INTO users (username, first_name, last_name, photo_url, language_code, is_premium,
              id, referral_code, population, power, wins, shield_until, plus_until, state, version,
              created_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      args: [
        ...profileArgs(auth.user),
        auth.user.id,
        newLegacyCode(),
        ...stateColumns(state),
        JSON.stringify(state),
        now,
        now,
      ],
    };
    try {
      await db.execute(insert);
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
  fn: (s: GameState) => GameState,
  /** The player as just loaded, to skip the first read (the version check still guards it). */
  loaded?: Player
): Promise<Player> {
  const db = await getDb();
  for (let attempt = 0; attempt < 8; attempt++) {
    const player = attempt === 0 && loaded?.id === id ? loaded : await findById(id);
    if (!player) throw new Error("Player not found");
    const next = fn(advance(player.state, now));
    const rs = await db.execute({
      sql: `UPDATE users SET state = ?, population = ?, power = ?, wins = ?, shield_until = ?,
              plus_until = ?, version = version + 1 WHERE id = ? AND version = ?`,
      args: [JSON.stringify(next), ...stateColumns(next), id, player.version],
    });
    if (rs.rowsAffected === 1) return { ...player, version: player.version + 1, state: next };
  }
  throw new Error("Too many simultaneous updates, try again");
}

/**
 * Where a player's picture is served from: their Telegram profile photo,
 * fetched through the bot (see /api/avatar/[id]). Works even when Telegram
 * leaves the photo out of the sign-in data.
 */
export const avatarUrl = (id: number) => `/api/avatar/${id}`;

export async function rankOf(population: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT COUNT(*) + 1 AS rank FROM users WHERE population > ?",
    args: [population],
  });
  return Number(rs.rows[0].rank);
}

/** The clan badge shown with the player: name, tag and flag, or null. */
async function clanBadge(clanId: number | null) {
  if (clanId == null) return null;
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT id, name, tag, leader_id, flag FROM clans WHERE id = ?", args: [clanId] });
  const c = rs.rows[0];

  return c
    ? { id: Number(c.id), name: String(c.name), tag: String(c.tag), leaderId: Number(c.leader_id), flag: storedFlag(c.flag, Number(c.id)) }
    : null;
}

/** Offers other players have open on the market right now (what the player could buy). */
async function marketOffers(id: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM trades WHERE status = 'open' AND seller_id != ?",
    args: [id],
  });

  return Number(rs.rows[0]?.n ?? 0);
}

export async function playerView(p: Player, now: number) {
  // Independent lookups: run them together instead of one after another.
  const [clan, rank, trades] = await Promise.all([clanBadge(p.clanId), rankOf(p.state.population), marketOffers(p.id)]);

  return {
    serverTime: now,
    me: {
      id: p.id,
      username: p.username,
      firstName: p.firstName,
      lastName: p.lastName,
      photoUrl: avatarUrl(p.id),
      clan,
      rank,
      /** Other players' open offers, shown as a badge on the header's Trade button. */
      marketOffers: trades,
      /** Monthly Valorians Plus price in Telegram Stars. */
      plusPrice: plusPrice(),
    },
    state: p.state,
  };
}

export type PlayerView = Awaited<ReturnType<typeof playerView>>;
