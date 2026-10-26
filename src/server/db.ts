import "server-only";

import { Client, createClient } from "@libsql/client";
import fs from "fs";
import path from "path";

/**
 * Turso (hosted libSQL) in production: set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
 * Without them we fall back to a local SQLite file, which is fine on a server
 * with a disk. On Vercel that file has to live in /tmp, which gets wiped, so it
 * only keeps the game running until Turso is configured.
 */
function makeClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) {
    return createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN,
      // Next.js caches fetch() calls made while rendering GET routes. Turso talks
      // over HTTP, so without this a repeated SELECT can get a stale cached
      // answer (e.g. "player not found" right after creating them).
      fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }),
    });
  }

  let file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "valorians.db");

  if (process.env.VERCEL && !process.env.DATABASE_PATH) {
    // Vercel only allows writing to /tmp, which is wiped whenever the server
    // restarts. The game runs, but progress can reset until Turso is set up.
    file = "/tmp/valorians.db";
    // eslint-disable-next-line no-console
    console.warn("TURSO_DATABASE_URL is not set: using temporary storage, progress may reset.");
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return createClient({ url: `file:${file}` });
}

declare global {
  // eslint-disable-next-line no-var
  var __valoriansDb: Promise<Client> | undefined;
}

async function init(): Promise<Client> {
  const client = makeClient();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY,           -- Telegram user id
      username      TEXT,
      first_name    TEXT NOT NULL DEFAULT '',
      last_name     TEXT,
      photo_url     TEXT,
      language_code TEXT,
      is_premium    INTEGER NOT NULL DEFAULT 0,
      referral_code TEXT NOT NULL UNIQUE,
      referred_by   INTEGER REFERENCES users(id),
      population    REAL NOT NULL DEFAULT 0,       -- copy of state.population for ranking
      state         TEXT NOT NULL,                 -- JSON GameState
      version       INTEGER NOT NULL DEFAULT 0,    -- bumps on every save (optimistic locking)
      created_at    INTEGER NOT NULL,
      last_seen_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS users_population ON users(population DESC);
    CREATE INDEX IF NOT EXISTS users_referred_by ON users(referred_by);

    CREATE TABLE IF NOT EXISTS battles (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      attacker_id   INTEGER NOT NULL,
      defender_id   INTEGER,                       -- null for barbarian camps
      camp_level    INTEGER,
      attacker_won  INTEGER NOT NULL,
      report        TEXT NOT NULL,                 -- JSON RaidReport + names
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS battles_attacker ON battles(attacker_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS battles_defender ON battles(defender_id, created_at DESC);
  `);

  // Columns added after launch. ADD COLUMN fails if it already exists; that's fine.
  for (const col of [
    "power REAL NOT NULL DEFAULT 0",
    "wins INTEGER NOT NULL DEFAULT 0",
    "shield_until INTEGER NOT NULL DEFAULT 0",
    "map_x INTEGER",
    "map_y INTEGER",
    "photo_src TEXT",
    "clan_id INTEGER",
    "clan_joined_at INTEGER",
  ]) {
    await client.execute(`ALTER TABLE users ADD COLUMN ${col}`).catch(() => {});
  }
  await client.execute("ALTER TABLE battles ADD COLUMN attack_id INTEGER").catch(() => {});
  await client.executeMultiple(`
    CREATE INDEX IF NOT EXISTS users_power ON users(power DESC);
    CREATE INDEX IF NOT EXISTS users_wins ON users(wins DESC);
    CREATE INDEX IF NOT EXISTS users_map ON users(map_x, map_y);
    CREATE INDEX IF NOT EXISTS users_clan ON users(clan_id);

    -- Clans: players band together under a name and tag. Membership lives in
    -- users.clan_id; the leader is the only one who can remove members.
    CREATE TABLE IF NOT EXISTS clans (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL UNIQUE COLLATE NOCASE,
      tag           TEXT NOT NULL UNIQUE COLLATE NOCASE,
      description   TEXT NOT NULL DEFAULT '',
      leader_id     INTEGER NOT NULL,
      created_at    INTEGER NOT NULL
    );

    -- Armies marching across the world map. The battle happens when they arrive.
    CREATE TABLE IF NOT EXISTS attacks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      attacker_id   INTEGER NOT NULL,
      defender_id   INTEGER,                       -- null for barbarian camps
      camp_level    INTEGER,
      units         TEXT NOT NULL,                 -- JSON Army
      from_x        INTEGER NOT NULL,
      from_y        INTEGER NOT NULL,
      to_x          INTEGER NOT NULL,
      to_y          INTEGER NOT NULL,
      sent_at       INTEGER NOT NULL,
      arrives_at    INTEGER NOT NULL,
      status        TEXT NOT NULL DEFAULT 'marching' -- marching | resolving | done | recalled
    );
    CREATE INDEX IF NOT EXISTS attacks_due ON attacks(status, arrives_at);
    CREATE INDEX IF NOT EXISTS attacks_attacker ON attacks(attacker_id, status);
    CREATE INDEX IF NOT EXISTS attacks_defender ON attacks(defender_id, status);

    -- Marketplace offers. The seller's goods are locked while the offer is
    -- open; once accepted both loads travel and arrive at arrives_at.
    CREATE TABLE IF NOT EXISTS trades (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id     INTEGER NOT NULL,
      give          TEXT NOT NULL,
      give_amount   INTEGER NOT NULL,
      want          TEXT NOT NULL,
      want_amount   INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      status        TEXT NOT NULL DEFAULT 'open', -- open | accepted | delivering | delivered | cancelled
      buyer_id      INTEGER,
      accepted_at   INTEGER,
      arrives_at    INTEGER
    );
    CREATE INDEX IF NOT EXISTS trades_open ON trades(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS trades_seller ON trades(seller_id, status);
    CREATE INDEX IF NOT EXISTS trades_buyer ON trades(buyer_id, status);
    CREATE INDEX IF NOT EXISTS trades_due ON trades(status, arrives_at);

    -- Chiefs asking to join a clan that takes members by request.
    CREATE TABLE IF NOT EXISTS clan_requests (
      clan_id       INTEGER NOT NULL,
      user_id       INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      PRIMARY KEY (clan_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS clan_requests_user ON clan_requests(user_id);

    -- The clan chronicle: joins, donations, techs, promotions...
    CREATE TABLE IF NOT EXISTS clan_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      clan_id       INTEGER NOT NULL,
      at            INTEGER NOT NULL,
      actor_id      INTEGER,
      target_id     INTEGER,
      kind          TEXT NOT NULL,
      data          TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS clan_log_clan ON clan_log(clan_id, id DESC);
  `);

  // Clan flags, roles, join policy, treasury and techs (added after clans launched).
  for (const [table, col] of [
    ["clans", "flag TEXT"],
    ["clans", "join_mode TEXT NOT NULL DEFAULT 'open'"],
    ["clans", "min_population INTEGER NOT NULL DEFAULT 0"],
    ["clans", "t_iron REAL NOT NULL DEFAULT 0"],
    ["clans", "t_wood REAL NOT NULL DEFAULT 0"],
    ["clans", "t_clay REAL NOT NULL DEFAULT 0"],
    ["clans", "t_crop REAL NOT NULL DEFAULT 0"],
    ["clans", "t_coins REAL NOT NULL DEFAULT 0"],
    ["clans", "tech_hall INTEGER NOT NULL DEFAULT 0"],
    ["clans", "tech_fields INTEGER NOT NULL DEFAULT 0"],
    ["clans", "tech_banners INTEGER NOT NULL DEFAULT 0"],
    ["clans", "tech_shieldwall INTEGER NOT NULL DEFAULT 0"],
    ["users", "clan_role TEXT"],
    ["users", "clan_donated REAL NOT NULL DEFAULT 0"],
    // Bot announcements: players who muted news, or blocked / never started the bot.
    ["users", "news_off INTEGER NOT NULL DEFAULT 0"],
    ["users", "bot_blocked INTEGER NOT NULL DEFAULT 0"],
  ]) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col}`).catch(() => {});
  }
  await client.executeMultiple(`
    -- Update announcements an admin broadcasts from the bot chat. The post is
    -- copied from the admin's own message (text, photo, video...) to every
    -- player, in batches, resuming from cursor (the last user id reached).
    CREATE TABLE IF NOT EXISTS announcements (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id      INTEGER NOT NULL,
      source_chat   INTEGER,                       -- the admin's chat holding the post
      source_msg    INTEGER,                       -- message id of the post to copy
      status        TEXT NOT NULL DEFAULT 'awaiting', -- awaiting | draft | sending | done | cancelled
      to_channel    INTEGER NOT NULL DEFAULT 0,
      cursor        INTEGER NOT NULL DEFAULT 0,
      total         INTEGER NOT NULL DEFAULT 0,
      sent          INTEGER NOT NULL DEFAULT 0,
      failed        INTEGER NOT NULL DEFAULT 0,
      locked_until  INTEGER NOT NULL DEFAULT 0,   -- one sender at a time
      created_at    INTEGER NOT NULL,
      started_at    INTEGER,
      finished_at   INTEGER
    );
    CREATE INDEX IF NOT EXISTS announcements_status ON announcements(status);

    -- Small settings the server keeps, e.g. the last version announced.
    CREATE TABLE IF NOT EXISTS meta (
      key           TEXT PRIMARY KEY,
      value         TEXT NOT NULL
    );
  `);
  // Which deployed version a drafted announcement is about (null for /announce posts).
  await client.execute("ALTER TABLE announcements ADD COLUMN release TEXT").catch(() => {});
  return client;
}

/** Shared, lazily-initialised database client. */
export function getDb(): Promise<Client> {
  if (!globalThis.__valoriansDb) {
    globalThis.__valoriansDb = init().catch((e) => {
      globalThis.__valoriansDb = undefined; // let the next request retry
      throw e;
    });
  }
  return globalThis.__valoriansDb;
}
