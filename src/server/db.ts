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
  ]) {
    await client.execute(`ALTER TABLE users ADD COLUMN ${col}`).catch(() => {});
  }
  await client.executeMultiple(`
    CREATE INDEX IF NOT EXISTS users_power ON users(power DESC);
    CREATE INDEX IF NOT EXISTS users_wins ON users(wins DESC);
  `);
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
