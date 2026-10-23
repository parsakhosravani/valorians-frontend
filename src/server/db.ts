import "server-only";

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "valorians.db");

declare global {
  // Reuse one connection across hot reloads in dev.
  // eslint-disable-next-line no-var
  var __valoriansDb: Database.Database | undefined;
}

function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");

  db.exec(`
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
      created_at    INTEGER NOT NULL,
      last_seen_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS users_population ON users(population DESC);
    CREATE INDEX IF NOT EXISTS users_referred_by ON users(referred_by);
  `);
  return db;
}

export const db: Database.Database = globalThis.__valoriansDb ?? (globalThis.__valoriansDb = open());
