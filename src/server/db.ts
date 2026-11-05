import "server-only";

import { Client, createClient } from "@libsql/client";
import fs from "fs";
import path from "path";

/**
 * Couldn't reach the database at all: the connection was never made, so the
 * statement never got there and sending it again is safe, writes included.
 * (A connection cut mid-request is not on this list: it may have run.)
 */
export function neverConnected(e: unknown): boolean {
  const cause = (e as { cause?: { code?: string } } | null)?.cause;
  const code = cause?.code ?? (e as { code?: string } | null)?.code;

  return ["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"].includes(String(code));
}

/**
 * Turso now and then doesn't answer a new connection (5 Nov 2026: one map
 * load failed after a 10 s connect timeout to us-east-1). Try once more
 * before the player sees an error.
 */
export async function fetchRetrying(input: RequestInfo | URL, init?: RequestInit, tries = 2): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      if (i >= tries || !neverConnected(e)) throw e;
      console.warn("database connection failed, retrying", (e as Error).message);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

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
      fetch: (input: RequestInfo | URL, init?: RequestInit) => fetchRetrying(input, { ...init, cache: "no-store" }),
    });
  }

  let file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "valorians.db");

  if (process.env.VERCEL && !process.env.DATABASE_PATH) {
    // Vercel only allows writing to /tmp, which is wiped whenever the server
    // restarts. The game runs, but progress can reset until Turso is set up.
    file = "/tmp/valorians.db";
    console.warn("TURSO_DATABASE_URL is not set: using temporary storage, progress may reset.");
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return createClient({ url: `file:${file}` });
}

declare global {
  var __valoriansDb: Promise<Client> | undefined;
}

/**
 * Bump this whenever the schema below changes (a new table, column or index).
 * A database already at this version skips the whole setup, so a cold start
 * costs one query instead of ~40 round trips to Turso.
 */
const SCHEMA_VERSION = 13; // 5: spies, 6: in-game notices, 7: clan_log_target (aid limits), 8: seasons + wonders, 9: outposts, 10: event_log, 11: outposts.claimed_at, 12: clans fighting together, 13: strikes muster at home, shields vs armies on the road

async function schemaVersion(client: Client): Promise<number> {
  try {
    const rs = await client.execute("SELECT value FROM meta WHERE key = 'schema_version'");

    return rs.rows[0] ? Number(rs.rows[0].value) : 0;
  } catch {
    return 0; // fresh database: no meta table yet
  }
}

async function init(): Promise<Client> {
  const client = makeClient();

  if ((await schemaVersion(client)) >= SCHEMA_VERSION) return client;
  await migrate(client);
  await client.execute({
    sql: "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: [String(SCHEMA_VERSION)],
  });

  return client;
}

/** Creates or upgrades every table. Safe to run again on an up-to-date database. */
async function migrate(client: Client) {
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
      status        TEXT NOT NULL DEFAULT 'marching' -- marching | resolving | fighting | done | recalled | redirected
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
      status        TEXT NOT NULL DEFAULT 'open', -- open | accepted | delivering | seller-paid | delivered | cancelled
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
    -- Aid a player received lately, from any clan (see CLAN.aidDailyHours).
    CREATE INDEX IF NOT EXISTS clan_log_target ON clan_log(target_id, kind, at);

    -- Outposts on the map (see OUTPOST): one tile each, never shared. The fields live in the owner's state.
    CREATE TABLE IF NOT EXISTS outposts (
      user_id  INTEGER NOT NULL,
      idx      INTEGER NOT NULL,
      x        INTEGER NOT NULL,
      y        INTEGER NOT NULL,
      PRIMARY KEY (user_id, idx),
      UNIQUE (x, y)
    );
    CREATE INDEX IF NOT EXISTS outposts_xy ON outposts(x, y);

    -- Seasons: the race to finish a World Wonder (see WONDER). The open season has no ended_at.
    CREATE TABLE IF NOT EXISTS seasons (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at     INTEGER NOT NULL,
      ended_at       INTEGER,
      winner_clan_id INTEGER,
      winner_name    TEXT,
      winner_tag     TEXT
    );
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
    ["clans", "wonder_level INTEGER NOT NULL DEFAULT 0"],
    ["clans", "wonder_next_at INTEGER NOT NULL DEFAULT 0"],
    ["users", "clan_role TEXT"],
    ["users", "clan_donated REAL NOT NULL DEFAULT 0"],
    // Bot announcements: players who muted news, or blocked / never started the bot.
    ["users", "news_off INTEGER NOT NULL DEFAULT 0"],
    ["users", "bot_blocked INTEGER NOT NULL DEFAULT 0"],
  ]) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col}`).catch(() => {});
  }
  // Timed battles: once an army arrives the fight lasts until ends_at; the
  // decided result and its rounds are kept in battle (JSON) meanwhile.
  for (const col of ["ends_at INTEGER", "battle TEXT"]) {
    await client.execute(`ALTER TABLE attacks ADD COLUMN ${col}`).catch(() => {});
  }
  await client.execute("CREATE INDEX IF NOT EXISTS attacks_fighting ON attacks(status, ends_at)");
  // New orders on the road: spoils the army carries from an earlier battle,
  // how many new orders this expedition took, the march home's length from
  // the new target, and the march it continues (status 'redirected').
  for (const col of ["loot TEXT", "coins INTEGER NOT NULL DEFAULT 0", "hops INTEGER NOT NULL DEFAULT 0", "home_ms INTEGER", "parent_id INTEGER"]) {
    await client.execute(`ALTER TABLE attacks ADD COLUMN ${col}`).catch(() => {});
  }
  // Bandits. Lairs are placed by the map itself; this keeps when each was last
  // cleared (and by whom). An army can march on a lair (lair_level, at to_x/to_y),
  // and be ambushed on the road (ambush JSON, sprung at ambush_at). Merchants'
  // loads can be guarded, or robbed (rob_a: the seller's load, rob_b: the
  // buyer's; rob_at is the next robbery still to happen).
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS bandit_lairs (
      x             INTEGER NOT NULL,
      y             INTEGER NOT NULL,
      cleared_at    INTEGER NOT NULL,
      cleared_by    INTEGER,
      PRIMARY KEY (x, y)
    );
  `);
  for (const [table, col] of [
    ["attacks", "lair_level INTEGER"],
    ["attacks", "ambush TEXT"],
    ["attacks", "ambush_at INTEGER"],
    ["trades", "guard_seller INTEGER NOT NULL DEFAULT 0"],
    ["trades", "guard_buyer INTEGER NOT NULL DEFAULT 0"],
    ["trades", "rob_a TEXT"],
    ["trades", "rob_b TEXT"],
    ["trades", "rob_at INTEGER"],
  ]) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col}`).catch(() => {});
  }
  await client.execute("CREATE INDEX IF NOT EXISTS attacks_ambush ON attacks(ambush_at)");
  await client.execute("CREATE INDEX IF NOT EXISTS trades_rob ON trades(rob_at)");
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

    -- Spies: a player watching another tribe until \`until\` (see SPY).
    CREATE TABLE IF NOT EXISTS spies (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      watcher_id    INTEGER NOT NULL,
      target_id     INTEGER NOT NULL,
      placed_at     INTEGER NOT NULL,
      until         INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS spies_target ON spies(target_id, until);
    CREATE INDEX IF NOT EXISTS spies_watcher ON spies(watcher_id, until);

    -- In-game copy of every bot notification (see notices.ts), so players who
    -- never started the bot, or missed the message, still see it in the game.
    CREATE TABLE IF NOT EXISTS notices (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      html          TEXT NOT NULL,                 -- same text as the bot message (only <b> tags)
      button        TEXT NOT NULL,
      path          TEXT NOT NULL,                 -- where tapping it takes you in the game
      read          INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS notices_user ON notices(user_id, id DESC);

    -- Small settings the server keeps, e.g. the last version announced.
    CREATE TABLE IF NOT EXISTS meta (
      key           TEXT PRIMARY KEY,
      value         TEXT NOT NULL
    );
  `);
  // Which deployed version a drafted announcement is about (null for /announce posts).
  await client.execute("ALTER TABLE announcements ADD COLUMN release TEXT").catch(() => {});
  // Text of an automatic release post (sent as a message; others are copied from source_msg).
  await client.execute("ALTER TABLE announcements ADD COLUMN body TEXT").catch(() => {});

  // Valorians Plus: copy of state.plus.until for badges in SQL lists, and
  // every Telegram Stars payment (the charge id makes each one count once).
  await client.execute("ALTER TABLE users ADD COLUMN plus_until INTEGER NOT NULL DEFAULT 0").catch(() => {});
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS payments (
      charge_id     TEXT PRIMARY KEY,              -- telegram_payment_charge_id
      user_id       INTEGER NOT NULL,
      product       TEXT NOT NULL,                 -- 'plus' or 'shield:<option>'
      stars         INTEGER NOT NULL,
      recurring     INTEGER NOT NULL DEFAULT 0,    -- a monthly renewal, not the first payment
      expires_at    INTEGER,                       -- subscription end Telegram reported (ms)
      refunded_at   INTEGER,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS payments_user ON payments(user_id, created_at DESC);
  `);

  // What other players see of a tribe, copied out of the state on every save
  // so the map doesn't load every village's whole state (see defenseSnapshot).
  // def_until: when the copy goes stale (NULL: not until the next save). It
  // starts at 0, so rows saved before these columns existed count as stale:
  // the map reads their state, and the cron fills them in (refreshTribeColumns).
  for (const col of [
    "town_hall INTEGER NOT NULL DEFAULT 0",
    "harbor INTEGER NOT NULL DEFAULT 0",
    "def_troops REAL NOT NULL DEFAULT 0",
    "def_bonus REAL NOT NULL DEFAULT 0",
    "def_wall REAL NOT NULL DEFAULT 0",
    "def_pop REAL NOT NULL DEFAULT 0",
    "def_growth REAL NOT NULL DEFAULT 0",
    "def_at INTEGER NOT NULL DEFAULT 0",
    "def_until INTEGER DEFAULT 0",
  ]) {
    await client.execute(`ALTER TABLE users ADD COLUMN ${col}`).catch(() => {});
  }
  await client.execute("CREATE INDEX IF NOT EXISTS users_def_until ON users(def_until)");

  // Ranks kept in columns, worked out for everyone at once (see ranks.ts).
  // NULL until the first pass: readers count instead meanwhile.
  for (const [table, col] of [
    ["users", "pop_rank INTEGER"],
    ["users", "power_rank INTEGER"],
    ["users", "wins_rank INTEGER"],
    ["clans", "sum_members INTEGER NOT NULL DEFAULT 0"],
    ["clans", "sum_population REAL NOT NULL DEFAULT 0"],
    ["clans", "sum_power REAL NOT NULL DEFAULT 0"],
    ["clans", "sum_wins INTEGER NOT NULL DEFAULT 0"],
    ["clans", "pop_rank INTEGER"],
  ]) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col}`).catch(() => {});
  }
  await client.executeMultiple(`
    CREATE INDEX IF NOT EXISTS users_pop_rank ON users(pop_rank);
    CREATE INDEX IF NOT EXISTS users_power_rank ON users(power_rank);
    CREATE INDEX IF NOT EXISTS users_wins_rank ON users(wins_rank);
    CREATE INDEX IF NOT EXISTS clans_pop_rank ON clans(pop_rank);
  `);

  // When a tile was claimed for an outpost being founded, so a claim left behind by a
  // crashed request can be told from one in progress (see settleOutpost). 0 = before this column.
  await client.execute("ALTER TABLE outposts ADD COLUMN claimed_at INTEGER NOT NULL DEFAULT 0").catch(() => {});

  // Clans fighting together (see src/server/clanWar.ts).
  await client.executeMultiple(`
    -- Troops guarding a clanmate's village: on the way (marching), there (stationed), or done.
    CREATE TABLE IF NOT EXISTS support (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id      INTEGER NOT NULL,
      host_id       INTEGER NOT NULL,
      units         TEXT NOT NULL,                 -- JSON Army, kept up to date with losses
      status        TEXT NOT NULL,                 -- marching | stationed | done
      sent_at       INTEGER NOT NULL,
      arrives_at    INTEGER NOT NULL,
      from_x        INTEGER NOT NULL,
      from_y        INTEGER NOT NULL,
      to_x          INTEGER NOT NULL,
      to_y          INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS support_due ON support(status, arrives_at);
    CREATE INDEX IF NOT EXISTS support_owner ON support(owner_id, status);
    CREATE INDEX IF NOT EXISTS support_host ON support(host_id, status);

    -- A clan strike: armies sent to it land on the target at land_at, together.
    CREATE TABLE IF NOT EXISTS clan_rallies (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      clan_id       INTEGER NOT NULL,
      target_id     INTEGER NOT NULL,
      land_at       INTEGER NOT NULL,
      created_by    INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      note          TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS clan_rallies_clan ON clan_rallies(clan_id, land_at);

    -- Treaties and wars between two clans: a < b, so one row per pair.
    CREATE TABLE IF NOT EXISTS clan_relations (
      a             INTEGER NOT NULL,
      b             INTEGER NOT NULL,
      kind          TEXT NOT NULL,                 -- ally | nap | war
      status        TEXT NOT NULL,                 -- proposed | active
      proposed_by   INTEGER NOT NULL,              -- the clan that asked (or declared war)
      created_at    INTEGER NOT NULL,
      ends_at       INTEGER,                       -- wars end by themselves
      score_a       INTEGER NOT NULL DEFAULT 0,    -- war: raid wins of clan a over clan b
      score_b       INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (a, b)
    );
    CREATE INDEX IF NOT EXISTS clan_relations_b ON clan_relations(b);

    -- What each member did for the clan this week (the weekly goal and the contribution board).
    CREATE TABLE IF NOT EXISTS clan_week (
      clan_id       INTEGER NOT NULL,
      week          INTEGER NOT NULL,
      user_id       INTEGER NOT NULL,
      camps         INTEGER NOT NULL DEFAULT 0,
      wins          INTEGER NOT NULL DEFAULT 0,
      donated       REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (clan_id, week, user_id)
    );
    -- Weekly goals already paid out (once per clan per week).
    CREATE TABLE IF NOT EXISTS clan_week_done (
      clan_id       INTEGER NOT NULL,
      week          INTEGER NOT NULL,
      at            INTEGER NOT NULL,
      PRIMARY KEY (clan_id, week)
    );
  `);
  await client.execute("ALTER TABLE attacks ADD COLUMN rally_id INTEGER").catch(() => {});
  await client.execute("CREATE INDEX IF NOT EXISTS attacks_rally ON attacks(rally_id)");
  // When an army was committed (sent, or its clan strike called): shields raised later don't stop it.
  await client.execute("ALTER TABLE attacks ADD COLUMN committed_at INTEGER").catch(() => {});
  // Armies joining a clan strike wait at home and set out just in time (see resolveMusters).
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS rally_musters (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      rally_id      INTEGER NOT NULL,
      user_id       INTEGER NOT NULL,
      target_id     INTEGER NOT NULL,
      units         TEXT NOT NULL,                 -- JSON Army: what to send when it's time
      depart_at     INTEGER NOT NULL,
      land_at       INTEGER NOT NULL,
      status        TEXT NOT NULL,                 -- waiting | leaving | gone | failed | cancelled
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS rally_musters_due ON rally_musters(status, depart_at);
    CREATE INDEX IF NOT EXISTS rally_musters_rally ON rally_musters(rally_id, status);
  `);
  // The clan's Telegram group, shown on the Clan screen (a t.me link).
  await client.execute("ALTER TABLE clans ADD COLUMN chat_url TEXT").catch(() => {});

  // Everything that happened today, to check the game's flows each night
  // (see events.ts / eventReport.ts). The cron deletes each day after its report.
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS event_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      at            INTEGER NOT NULL,
      level         TEXT NOT NULL,                 -- info | warn | error
      kind          TEXT NOT NULL,                 -- api, save, war.begin, trade.deliver, cron.run, ...
      player_id     INTEGER,
      ctx           TEXT,                          -- what caused it: route or job
      data          TEXT NOT NULL                  -- JSON
    );
    CREATE INDEX IF NOT EXISTS event_log_at ON event_log(at);
    CREATE INDEX IF NOT EXISTS event_log_player ON event_log(player_id, at);
    CREATE INDEX IF NOT EXISTS event_log_kind ON event_log(kind, at);
  `);
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
