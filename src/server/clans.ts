import "server-only";

import type { InStatement } from "@libsql/client";

import { getDb } from "./db";
import { notify } from "./notify";
import { Player, avatarUrl, findById, mutatePlayer } from "./players";

import {
  CLAN_TECHS,
  ClanPerks,
  ClanRole,
  JoinMode,
  NO_PERKS,
  TECH_BY_ID,
  TECH_IDS,
  TREASURY_KEYS,
  TechId,
  Techs,
  Treasury,
  CLAN_TECH_MAX_LEVEL,
  can,
  canAfford,
  canKick,
  clanLevel,
  contributionValue,
  isResource,
  isTreasuryKey,
  maxMembers,
  parseFlag,
  perksFor,
  samePerks,
  storedFlag,
  techCost,
} from "@/lib/game/clan";
import { CLAN, RESOURCE_NAMES } from "@/lib/game/config";
import { GameError, getRates } from "@/lib/game/engine";

/**
 * Clans: players band together under a name, a tag and a flag.
 * - anyone without a clan can found one (costs coins), join an open one, or
 *   ask to join one that takes members by request
 * - the founder leads (Jarl); the leader names officers (Huscarls) who can
 *   accept requests, remove warriors, spend the treasury and edit the flag
 * - members donate resources and coins to the treasury; officers spend it on
 *   clan techs (perks for every member) or send aid to a member
 * - when the leader leaves, the longest-serving officer (or else member)
 *   takes over; the last member to leave disbands the clan
 * Membership is users.clan_id, so a player is in at most one clan. Tech perks
 * are copied into each member's game state (clanPerks) so the engine applies
 * them on both the server and the client.
 */

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

const memberName = (r: Record<string, unknown>) =>
  String(r.first_name || (r.username ? `@${r.username}` : "Player"));

const TECH_COL: Record<TechId, string> = {
  hall: "tech_hall",
  fields: "tech_fields",
  banners: "tech_banners",
  shieldwall: "tech_shieldwall",
};
const TREASURY_COL = Object.fromEntries(TREASURY_KEYS.map((k) => [k, `t_${k}`])) as Record<keyof Treasury, string>;

/** Clans with their size and strength. */
const CLAN_TOTALS = `
  SELECT c.*,
         COUNT(u.id) AS members,
         COALESCE(SUM(u.population), 0) AS population,
         COALESCE(SUM(u.power), 0) AS power,
         COALESCE(SUM(u.wins), 0) AS wins
  FROM clans c LEFT JOIN users u ON u.clan_id = c.id
  GROUP BY c.id`;

type ClanRow = Record<string, unknown>;

const techsOf = (r: ClanRow): Techs =>
  Object.fromEntries(TECH_IDS.map((t) => [t, Number(r[TECH_COL[t]] ?? 0)])) as Techs;

const treasuryOf = (r: ClanRow): Treasury =>
  Object.fromEntries(TREASURY_KEYS.map((k) => [k, Math.floor(Number(r[TREASURY_COL[k]] ?? 0))])) as Treasury;

const joinModeOf = (r: ClanRow): JoinMode => {
  const m = String(r.join_mode ?? "open");

  return m === "request" || m === "closed" ? m : "open";
};

const summary = (r: ClanRow) => {
  const id = Number(r.id);
  const techs = techsOf(r);

  return {
    id,
    name: String(r.name),
    tag: String(r.tag),
    description: String(r.description ?? ""),
    flag: storedFlag(r.flag, id),
    leaderId: Number(r.leader_id),
    level: clanLevel(techs),
    joinMode: joinModeOf(r),
    minPopulation: Number(r.min_population ?? 0),
    members: Number(r.members ?? 0),
    maxMembers: maxMembers(techs),
    population: Math.floor(Number(r.population ?? 0)),
    power: Math.floor(Number(r.power ?? 0)),
    wins: Number(r.wins ?? 0),
    createdAt: Number(r.created_at),
  };
};

export type ClanSummary = ReturnType<typeof summary>;

/** A clan's own row (no totals), or null if it's gone. */
async function clanRow(clanId: number) {
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT * FROM clans WHERE id = ?", args: [clanId] });

  return rs.rows[0] ?? null;
}

/** The player's clan and their role in it. Throws if they have none. */
async function membership(player: Player) {
  if (player.clanId == null) throw new GameError("You're not in a clan", "no_clan");
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT c.*, u.clan_role AS my_role FROM users u JOIN clans c ON c.id = u.clan_id WHERE u.id = ?`,
    args: [player.id],
  });
  const c = rs.rows[0];

  if (!c) throw new GameError("You're not in a clan", "no_clan");

  return { clan: c, clanId: Number(c.id), role: roleOf(c, player.id, c.my_role) };
}

const roleOf = (clan: ClanRow, userId: number, storedRole: unknown): ClanRole =>
  Number(clan.leader_id) === userId ? "leader" : storedRole === "officer" ? "officer" : "member";

async function requireRole(player: Player, check: (r: ClanRole) => boolean, message: string) {
  const m = await membership(player);

  if (!check(m.role)) throw new GameError(message, "not_allowed");

  return m;
}

type LogKind =
  | "founded"
  | "joined"
  | "accepted"
  | "left"
  | "kicked"
  | "promoted"
  | "demoted"
  | "leader"
  | "donated"
  | "tech"
  | "aid"
  | "flag"
  | "settings";

const logStmt = (clanId: number, now: number, kind: LogKind, actorId: number | null, targetId: number | null = null, data: object = {}): InStatement => ({
  sql: "INSERT INTO clan_log (clan_id, at, actor_id, target_id, kind, data) VALUES (?, ?, ?, ?, ?, ?)",
  args: [clanId, now, actorId, targetId, kind, JSON.stringify(data)],
});

async function log(clanId: number, now: number, kind: LogKind, actorId: number | null, targetId: number | null = null, data: object = {}) {
  const db = await getDb();

  await db.execute(logStmt(clanId, now, kind, actorId, targetId, data)).catch((e) => {
    // eslint-disable-next-line no-console
    console.error("clan log", e);
  });
}

/** Writes the perks into one player's state (no-op if already right). */
async function setPerks(userId: number, perks: ClanPerks, now: number) {
  const p = await findById(userId);

  if (!p || samePerks(p.state.clanPerks, perks)) return p;

  return mutatePlayer(userId, now, (s) => ({ ...s, clanPerks: { ...perks } }));
}

/** Brings every member's perks in line with the clan's techs. */
async function syncClanPerks(clanId: number, now: number) {
  const db = await getDb();
  const c = await clanRow(clanId);

  if (!c) return;
  const perks = perksFor(techsOf(c));
  const rs = await db.execute({ sql: "SELECT id FROM users WHERE clan_id = ?", args: [clanId] });

  await Promise.all(rs.rows.map((r) => setPerks(Number(r.id), perks, now).catch(() => null)));
}

/** Returns the player with fresh state after a membership change (perks applied). */
async function afterMembership(player: Player, clanId: number | null, now: number): Promise<Player> {
  const c = clanId == null ? null : await clanRow(clanId);
  const perks = c ? perksFor(techsOf(c)) : NO_PERKS;
  const p = await setPerks(player.id, perks, now);

  return { ...(p ?? player), clanId };
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/** Everything the Clan screen needs: your clan (members, treasury, techs, requests, log) and clans to browse. */
export async function clanView(player: Player, search?: string) {
  const db = await getDb();
  const q = clean(search).slice(0, CLAN.nameMax);
  const [list, reqs] = await db.batch(
    [
      {
        sql: `SELECT * FROM (${CLAN_TOTALS}) t
              ${q ? "WHERE t.name LIKE ? OR t.tag LIKE ?" : ""}
              ORDER BY t.population DESC, t.id ASC LIMIT 50`,
        args: q ? [`%${q}%`, `%${q}%`] : [],
      },
      { sql: "SELECT clan_id FROM clan_requests WHERE user_id = ?", args: [player.id] },
    ],
    "read"
  );

  let mine = null;

  if (player.clanId != null) {
    const [own, members, rank, requests, entries] = await db.batch(
      [
        { sql: `SELECT * FROM (${CLAN_TOTALS}) t WHERE t.id = ?`, args: [player.clanId] },
        {
          sql: `SELECT id, username, first_name, population, power, wins, clan_joined_at, clan_role, clan_donated
                FROM users WHERE clan_id = ? ORDER BY population DESC, id ASC`,
          args: [player.clanId],
        },
        {
          sql: `SELECT COUNT(*) + 1 AS rank FROM (${CLAN_TOTALS}) t
                WHERE t.population > (SELECT COALESCE(SUM(population), 0) FROM users WHERE clan_id = ?)`,
          args: [player.clanId],
        },
        {
          sql: `SELECT u.id, u.username, u.first_name, u.population, u.power, u.clan_id, r.created_at
                FROM clan_requests r JOIN users u ON u.id = r.user_id
                WHERE r.clan_id = ? ORDER BY r.created_at ASC LIMIT 50`,
          args: [player.clanId],
        },
        {
          sql: `SELECT l.*, a.first_name AS a_first, a.username AS a_user, t.first_name AS t_first, t.username AS t_user
                FROM clan_log l
                LEFT JOIN users a ON a.id = l.actor_id
                LEFT JOIN users t ON t.id = l.target_id
                WHERE l.clan_id = ? ORDER BY l.id DESC LIMIT ?`,
          args: [player.clanId, CLAN.logSize],
        },
      ],
      "read"
    );

    if (own.rows[0]) {
      const row = own.rows[0];
      const c = summary(row);
      const techs = techsOf(row);
      const mapped = members.rows.map((m) => ({
        id: Number(m.id),
        name: memberName(m),
        photoUrl: avatarUrl(Number(m.id)),
        population: Math.floor(Number(m.population)),
        power: Math.floor(Number(m.power)),
        wins: Number(m.wins ?? 0),
        role: roleOf(row, Number(m.id), m.clan_role),
        contribution: Math.floor(Number(m.clan_donated ?? 0)),
        joinedAt: m.clan_joined_at == null ? null : Number(m.clan_joined_at),
      }));
      const myRole = mapped.find((m) => m.id === player.id)?.role ?? "member";

      mine = {
        ...c,
        rank: Number(rank.rows[0].rank),
        myRole,
        members: mapped,
        treasury: treasuryOf(row),
        techs: CLAN_TECHS.map((t) => ({
          id: t.id,
          level: techs[t.id],
          cost: techs[t.id] < CLAN_TECH_MAX_LEVEL ? techCost(techs[t.id]) : null,
        })),
        perks: perksFor(techs),
        // Only officers see who's waiting at the gate.
        requests: can.manage(myRole)
          ? requests.rows
              .filter((r) => r.clan_id == null)
              .map((r) => ({
                id: Number(r.id),
                name: memberName(r),
                photoUrl: avatarUrl(Number(r.id)),
                population: Math.floor(Number(r.population)),
                power: Math.floor(Number(r.power)),
                at: Number(r.created_at),
              }))
          : [],
        log: entries.rows.map((l) => ({
          id: Number(l.id),
          at: Number(l.at),
          kind: String(l.kind) as LogKind,
          actor: l.actor_id == null ? null : String(l.a_first || (l.a_user ? `@${l.a_user}` : "A chief")),
          target: l.target_id == null ? null : String(l.t_first || (l.t_user ? `@${l.t_user}` : "a chief")),
          data: JSON.parse(String(l.data || "{}")) as Record<string, string | number>,
        })),
      };
    }
  }

  return {
    mine,
    clans: list.rows.map(summary),
    requested: reqs.rows.map((r) => Number(r.clan_id)),
    limits: CLAN,
  };
}

export type ClanView = Awaited<ReturnType<typeof clanView>>;

/**
 * Any clan as the world sees it, for exploring from outside: banner, motto,
 * rank, techs and who's in it. Never its treasury, log or join requests.
 */
export async function clanPublic(clanId: number) {
  const db = await getDb();
  const [own, members, rank] = await db.batch(
    [
      { sql: `SELECT * FROM (${CLAN_TOTALS}) t WHERE t.id = ?`, args: [clanId] },
      {
        sql: `SELECT id, username, first_name, population, power, wins, clan_role
              FROM users WHERE clan_id = ? ORDER BY population DESC, id ASC`,
        args: [clanId],
      },
      {
        sql: `SELECT COUNT(*) + 1 AS rank FROM (${CLAN_TOTALS}) t
              WHERE t.population > (SELECT COALESCE(SUM(population), 0) FROM users WHERE clan_id = ?)`,
        args: [clanId],
      },
    ],
    "read"
  );
  const row = own.rows[0];

  if (!row) throw new GameError("That clan is gone", "not_found");
  const techs = techsOf(row);

  return {
    ...summary(row),
    rank: Number(rank.rows[0].rank),
    techs: CLAN_TECHS.map((t) => ({ id: t.id, level: techs[t.id] })),
    members: members.rows.map((m) => ({
      id: Number(m.id),
      name: memberName(m),
      photoUrl: avatarUrl(Number(m.id)),
      population: Math.floor(Number(m.population)),
      power: Math.floor(Number(m.power)),
      wins: Number(m.wins ?? 0),
      role: roleOf(row, Number(m.id), m.clan_role),
    })),
  };
}

export type ClanPublic = Awaited<ReturnType<typeof clanPublic>>;

// ─── Founding & membership ───────────────────────────────────────────────────

const checkName = (name: string) => {
  if (name.length < CLAN.nameMin || name.length > CLAN.nameMax)
    throw new GameError(`Clan name must be ${CLAN.nameMin}-${CLAN.nameMax} characters`, "bad_name");
  if (!/^[\p{L}\p{N} '._-]+$/u.test(name)) throw new GameError("Clan name has characters that aren't allowed", "bad_name");
};

const parseJoinMode = (v: unknown): JoinMode | null => (v === "open" || v === "request" || v === "closed" ? v : null);

/** Founds a clan with the player as leader. Charges CLAN.createCost coins. */
export async function createClan(player: Player, body: any, now: number): Promise<Player> {
  const name = clean(body?.name);
  const tag = clean(body?.tag).toUpperCase();
  const description = clean(body?.description).slice(0, CLAN.descriptionMax);
  const flag = body?.flag == null ? null : parseFlag(body.flag);
  const joinMode = parseJoinMode(body?.joinMode) ?? "open";

  if (player.clanId != null) throw new GameError("Leave your clan before founding a new one", "in_clan");
  checkName(name);
  if (tag.length < CLAN.tagMin || tag.length > CLAN.tagMax || !/^[A-Z0-9]+$/.test(tag))
    throw new GameError(`Tag must be ${CLAN.tagMin}-${CLAN.tagMax} letters or digits`, "bad_tag");
  if (body?.flag != null && !flag) throw new GameError("That flag isn't valid", "bad_flag");
  if (player.state.coins < CLAN.createCost)
    throw new GameError(`You need ${CLAN.createCost.toLocaleString("en-US")} coins to found a clan`, "not_enough_coins");

  const db = await getDb();
  let clanId: number;

  try {
    const rs = await db.execute({
      sql: "INSERT INTO clans (name, tag, description, leader_id, created_at, flag, join_mode) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [name, tag, description, player.id, now, flag ? JSON.stringify(flag) : null, joinMode],
    });

    clanId = Number(rs.lastInsertRowid);
  } catch (e) {
    const msg = String((e as Error).message);

    if (/clans\.name/i.test(msg)) throw new GameError("A clan with that name already exists", "name_taken");
    if (/clans\.tag/i.test(msg)) throw new GameError("That tag is already taken", "tag_taken");
    throw e;
  }

  const join = await db.execute({
    sql: "UPDATE users SET clan_id = ?, clan_joined_at = ?, clan_role = NULL, clan_donated = 0 WHERE id = ? AND clan_id IS NULL",
    args: [clanId, now, player.id],
  });

  if (join.rowsAffected !== 1) {
    await db.execute({ sql: "DELETE FROM clans WHERE id = ?", args: [clanId] });
    throw new GameError("Leave your clan before founding a new one", "in_clan");
  }

  try {
    const paid = await mutatePlayer(player.id, now, (s) => {
      if (s.coins < CLAN.createCost)
        throw new GameError(`You need ${CLAN.createCost.toLocaleString("en-US")} coins to found a clan`, "not_enough_coins");

      return { ...s, coins: s.coins - CLAN.createCost, clanPerks: { ...NO_PERKS } };
    });

    await db.batch(
      [{ sql: "DELETE FROM clan_requests WHERE user_id = ?", args: [player.id] }, logStmt(clanId, now, "founded", player.id)],
      "write"
    );

    return { ...paid, clanId };
  } catch (e) {
    // Couldn't pay: undo the clan so nothing is left half-made.
    await db.batch(
      [
        { sql: "UPDATE users SET clan_id = NULL, clan_joined_at = NULL WHERE id = ?", args: [player.id] },
        { sql: "DELETE FROM clans WHERE id = ?", args: [clanId] },
      ],
      "write"
    );
    throw e;
  }
}

/**
 * Puts a player into a clan in one statement, so two chiefs can't squeeze
 * into the last seat together. Returns false if they're already in a clan or
 * it's full.
 */
async function seat(userId: number, clanId: number, seats: number, now: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: `UPDATE users SET clan_id = ?, clan_joined_at = ?, clan_role = NULL, clan_donated = 0
          WHERE id = ? AND clan_id IS NULL
            AND (SELECT COUNT(*) FROM users WHERE clan_id = ?) < ?`,
    args: [clanId, now, userId, clanId, seats],
  });

  if (rs.rowsAffected === 1) await db.execute({ sql: "DELETE FROM clan_requests WHERE user_id = ?", args: [userId] });

  return rs.rowsAffected === 1;
}

/** Officers and the leader of a clan (for notifications). */
async function managersOf(clanId: number, leaderId: number) {
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT id FROM users WHERE clan_id = ? AND clan_role = 'officer'", args: [clanId] });

  return [leaderId, ...rs.rows.map((r) => Number(r.id))];
}

/**
 * Joins an open clan straight away, or asks to join one that takes members
 * by request. Returns the player and whether they're in yet.
 */
export async function joinClan(player: Player, body: any, now: number): Promise<{ player: Player; joined: boolean }> {
  const clanId = Number(body?.id);

  if (!Number.isInteger(clanId)) throw new GameError("Pick a clan to join", "bad_request");
  if (player.clanId != null) throw new GameError("Leave your clan before joining another", "in_clan");
  const c = await clanRow(clanId);

  if (!c) throw new GameError("That clan no longer exists", "not_found");
  const mode = joinModeOf(c);
  const minPop = Number(c.min_population ?? 0);

  if (mode === "closed") throw new GameError("This clan isn't taking new members", "closed");
  if (player.state.population < minPop)
    throw new GameError(`This clan wants chiefs with at least ${minPop.toLocaleString("en-US")} people`, "too_small");
  const seats = maxMembers(techsOf(c));
  const db = await getDb();

  if (mode === "request") {
    const out = await db.execute({ sql: "SELECT clan_id FROM clan_requests WHERE user_id = ?", args: [player.id] });

    if (out.rows.some((r) => Number(r.clan_id) === clanId)) throw new GameError("You've already asked to join this clan", "requested");
    if (out.rows.length >= CLAN.maxRequests)
      throw new GameError(`You can ask at most ${CLAN.maxRequests} clans at once. Withdraw one first.`, "too_many");
    await db.execute({
      sql: "INSERT OR IGNORE INTO clan_requests (clan_id, user_id, created_at) VALUES (?, ?, ?)",
      args: [clanId, player.id, now],
    });
    const who = player.firstName || (player.username ? `@${player.username}` : "A chief");

    for (const id of await managersOf(clanId, Number(c.leader_id))) void notify.clanRequest(id, who, String(c.name));

    return { player, joined: false };
  }

  if (!(await seat(player.id, clanId, seats, now))) {
    const again = await findById(player.id);

    if (again?.clanId != null) throw new GameError("Leave your clan before joining another", "in_clan");
    throw new GameError(`That clan is full (${seats} members)`, "clan_full");
  }
  await log(clanId, now, "joined", player.id);

  return { player: await afterMembership(player, clanId, now), joined: true };
}

/** Withdraws a request to join a clan. */
export async function cancelRequest(player: Player, body: any) {
  const db = await getDb();

  await db.execute({
    sql: "DELETE FROM clan_requests WHERE user_id = ? AND clan_id = ?",
    args: [player.id, Number(body?.id)],
  });
}

/** An officer accepts or declines a chief's request to join. */
export async function answerRequest(player: Player, body: any, now: number) {
  const target = Number(body?.id);
  const accept = !!body?.accept;
  const { clan, clanId } = await requireRole(player, can.manage, "Only the Jarl and Huscarls can answer requests");
  const db = await getDb();
  const del = await db.execute({
    sql: "DELETE FROM clan_requests WHERE clan_id = ? AND user_id = ?",
    args: [clanId, target],
  });

  if (del.rowsAffected !== 1) throw new GameError("That request is gone", "not_found");
  if (!accept) return;

  const who = await findById(target);

  if (!who) throw new GameError("That chief no longer exists", "not_found");
  if (who.clanId != null) throw new GameError("That chief has joined another clan", "in_clan");
  const seats = maxMembers(techsOf(clan));

  if (!(await seat(target, clanId, seats, now))) {
    // Put the request back so it isn't lost while the clan is full.
    await db.execute({
      sql: "INSERT OR IGNORE INTO clan_requests (clan_id, user_id, created_at) VALUES (?, ?, ?)",
      args: [clanId, target, now],
    });
    throw new GameError(`The clan is full (${seats} members). Raise the Great Hall for more seats.`, "clan_full");
  }
  await afterMembership(who, clanId, now);
  await log(clanId, now, "accepted", player.id, target);
  void notify.clanAccepted(target, String(clan.name));
}

/** Leaves the clan. A leader hands over to the longest-serving officer (else member); the last one out disbands it. */
export async function leaveClan(player: Player, now: number): Promise<Player> {
  const { clanId } = await membership(player);
  const db = await getDb();

  await db.execute({
    sql: "UPDATE users SET clan_id = NULL, clan_joined_at = NULL, clan_role = NULL, clan_donated = 0 WHERE id = ? AND clan_id = ?",
    args: [player.id, clanId],
  });

  const clan = await clanRow(clanId);

  if (clan && Number(clan.leader_id) === player.id) {
    const heir = await db.execute({
      sql: `SELECT id FROM users WHERE clan_id = ?
            ORDER BY (clan_role = 'officer') DESC, clan_joined_at ASC, id ASC LIMIT 1`,
      args: [clanId],
    });

    if (heir.rows[0]) {
      const heirId = Number(heir.rows[0].id);

      await db.batch(
        [
          { sql: "UPDATE clans SET leader_id = ? WHERE id = ?", args: [heirId, clanId] },
          { sql: "UPDATE users SET clan_role = NULL WHERE id = ?", args: [heirId] },
          logStmt(clanId, now, "left", player.id),
          logStmt(clanId, now, "leader", null, heirId),
        ],
        "write"
      );
    } else {
      // Last one out: the clan and its treasury are gone.
      await db.batch(
        [
          { sql: "DELETE FROM clans WHERE id = ?", args: [clanId] },
          { sql: "DELETE FROM clan_requests WHERE clan_id = ?", args: [clanId] },
          { sql: "DELETE FROM clan_log WHERE clan_id = ?", args: [clanId] },
        ],
        "write"
      );
    }
  } else {
    await log(clanId, now, "left", player.id);
  }

  return afterMembership(player, null, now);
}

/** The leader or an officer removes a member below them. */
export async function kickMember(player: Player, body: any, now: number): Promise<void> {
  const target = Number(body?.id);

  if (!Number.isInteger(target) || target === player.id) throw new GameError("Pick a member to remove", "bad_request");
  const { clan, clanId, role } = await membership(player);
  const db = await getDb();
  const t = await db.execute({ sql: "SELECT clan_id, clan_role FROM users WHERE id = ?", args: [target] });

  if (Number(t.rows[0]?.clan_id) !== clanId) throw new GameError("That player isn't in your clan", "not_member");
  if (!canKick(role, roleOf(clan, target, t.rows[0].clan_role)))
    throw new GameError(role === "member" ? "Only the Jarl and Huscarls can remove members" : "You can't remove someone of your rank", "not_allowed");

  const rs = await db.execute({
    sql: "UPDATE users SET clan_id = NULL, clan_joined_at = NULL, clan_role = NULL, clan_donated = 0 WHERE id = ? AND clan_id = ?",
    args: [target, clanId],
  });

  if (rs.rowsAffected !== 1) throw new GameError("That player isn't in your clan", "not_member");
  await setPerks(target, NO_PERKS, now);
  await log(clanId, now, "kicked", player.id, target);
}

// ─── Ranks & settings ────────────────────────────────────────────────────────

/** The leader makes a member an officer, or an officer a member again. */
export async function setRole(player: Player, body: any, now: number) {
  const target = Number(body?.id);
  const officer = body?.role === "officer";
  const { clanId } = await requireRole(player, can.promote, "Only the Jarl can change ranks");

  if (target === player.id) throw new GameError("You're the Jarl", "bad_request");
  const db = await getDb();

  if (officer) {
    const n = await db.execute({ sql: "SELECT COUNT(*) AS n FROM users WHERE clan_id = ? AND clan_role = 'officer'", args: [clanId] });

    if (Number(n.rows[0].n) >= CLAN.maxOfficers) throw new GameError(`A clan can have ${CLAN.maxOfficers} Huscarls`, "too_many");
  }
  const rs = await db.execute({
    sql: "UPDATE users SET clan_role = ? WHERE id = ? AND clan_id = ?",
    args: [officer ? "officer" : null, target, clanId],
  });

  if (rs.rowsAffected !== 1) throw new GameError("That player isn't in your clan", "not_member");
  await log(clanId, now, officer ? "promoted" : "demoted", player.id, target);
}

/** The leader hands the clan to another member and becomes an officer. */
export async function transferLeadership(player: Player, body: any, now: number) {
  const target = Number(body?.id);
  const { clanId } = await requireRole(player, can.settings, "Only the Jarl can pass on the clan");

  if (target === player.id) throw new GameError("You already lead this clan", "bad_request");
  const db = await getDb();
  const t = await db.execute({ sql: "SELECT clan_id FROM users WHERE id = ?", args: [target] });

  if (Number(t.rows[0]?.clan_id) !== clanId) throw new GameError("That player isn't in your clan", "not_member");
  await db.batch(
    [
      { sql: "UPDATE clans SET leader_id = ? WHERE id = ? AND leader_id = ?", args: [target, clanId, player.id] },
      { sql: "UPDATE users SET clan_role = NULL WHERE id = ?", args: [target] },
      { sql: "UPDATE users SET clan_role = 'officer' WHERE id = ?", args: [player.id] },
      logStmt(clanId, now, "leader", player.id, target),
    ],
    "write"
  );
}

/**
 * Edits the clan. Officers may change the flag and motto; only the leader may
 * change the name, how members join and the minimum population.
 */
export async function updateClan(player: Player, body: any, now: number) {
  const { clan, clanId, role } = await requireRole(player, can.manage, "Only the Jarl and Huscarls can edit the clan");
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const changed: string[] = [];

  if (body?.flag !== undefined) {
    const flag = parseFlag(body.flag);

    if (!flag) throw new GameError("That flag isn't valid", "bad_flag");
    sets.push("flag = ?");
    args.push(JSON.stringify(flag));
    changed.push("flag");
  }
  if (body?.description !== undefined) {
    sets.push("description = ?");
    args.push(clean(body.description).slice(0, CLAN.descriptionMax));
    changed.push("motto");
  }

  const leaderOnly = body?.joinMode !== undefined || body?.minPopulation !== undefined || body?.name !== undefined;

  if (leaderOnly && !can.settings(role)) throw new GameError("Only the Jarl can change the clan's name and how chiefs join", "not_allowed");
  if (body?.name !== undefined) {
    const name = clean(body.name);

    checkName(name);
    if (name !== String(clan.name)) {
      sets.push("name = ?");
      args.push(name);
      changed.push("name");
    }
  }
  if (body?.joinMode !== undefined) {
    const mode = parseJoinMode(body.joinMode);

    if (!mode) throw new GameError("Pick how chiefs can join", "bad_request");
    sets.push("join_mode = ?");
    args.push(mode);
    changed.push("joining");
  }
  if (body?.minPopulation !== undefined) {
    const min = Math.floor(Number(body.minPopulation));

    if (!Number.isFinite(min) || min < 0 || min > 10_000_000) throw new GameError("Pick a sensible minimum population", "bad_request");
    sets.push("min_population = ?");
    args.push(min);
    changed.push("minimum population");
  }
  if (!sets.length) return;

  const db = await getDb();

  try {
    await db.execute({ sql: `UPDATE clans SET ${sets.join(", ")} WHERE id = ?`, args: [...args, clanId] });
  } catch (e) {
    if (/clans\.name/i.test(String((e as Error).message))) throw new GameError("A clan with that name already exists", "name_taken");
    throw e;
  }
  if (changed.includes("flag")) await log(clanId, now, "flag", player.id);
  const rest = changed.filter((c) => c !== "flag");

  if (rest.length) await log(clanId, now, "settings", player.id, null, { what: rest.join(", ") });
}

// ─── Treasury ────────────────────────────────────────────────────────────────

const parseAmount = (v: unknown) => {
  const n = Math.floor(Number(v));

  if (!Number.isFinite(n) || n <= 0) throw new GameError("Enter an amount", "bad_amount");

  return n;
};

const keyName = (k: keyof Treasury) => (k === "coins" ? "coins" : RESOURCE_NAMES[k].toLowerCase());

/** A member gives resources or coins to the clan treasury. */
export async function donate(player: Player, body: any, now: number): Promise<Player> {
  const key = String(body?.key);

  if (!isTreasuryKey(key)) throw new GameError("Pick what to donate", "bad_request");
  const amount = parseAmount(body?.amount);
  const { clanId } = await membership(player);
  const paid = await mutatePlayer(player.id, now, (s) => {
    const have = key === "coins" ? s.coins : s.resources[key];

    if (have < amount) throw new GameError(`You only have ${Math.floor(have).toLocaleString("en-US")} ${keyName(key)}`, "not_enough");
    if (key === "coins") return { ...s, coins: s.coins - amount };

    return { ...s, resources: { ...s.resources, [key]: s.resources[key] - amount } };
  });

  const db = await getDb();
  const col = TREASURY_COL[key];
  const [rs] = await db.batch(
    [
      {
        sql: `UPDATE clans SET ${col} = ${col} + ? WHERE id = ? AND id = (SELECT clan_id FROM users WHERE id = ?)`,
        args: [amount, clanId, player.id],
      },
      {
        sql: "UPDATE users SET clan_donated = clan_donated + ? WHERE id = ? AND clan_id = ?",
        args: [contributionValue(key, amount), player.id, clanId],
      },
    ],
    "write"
  );

  if (rs.rowsAffected !== 1) {
    // Left the clan in between: give it back.
    await mutatePlayer(player.id, now, (s) =>
      key === "coins" ? { ...s, coins: s.coins + amount } : { ...s, resources: { ...s.resources, [key]: s.resources[key] + amount } }
    );
    throw new GameError("You're not in that clan any more", "no_clan");
  }
  await log(clanId, now, "donated", player.id, null, { key, amount });

  return paid;
}

/** An officer spends the treasury to raise a clan tech; every member's perks update. */
export async function upgradeTech(player: Player, body: any, now: number) {
  const tech = String(body?.tech) as TechId;

  if (!TECH_IDS.includes(tech)) throw new GameError("Pick a tech", "bad_request");
  const { clan, clanId } = await requireRole(player, can.manage, "Only the Jarl and Huscarls can spend the treasury");
  const level = techsOf(clan)[tech];

  if (level >= CLAN_TECH_MAX_LEVEL) throw new GameError("That tech is already at its highest level", "max_level");
  const cost = techCost(level);

  if (!canAfford(treasuryOf(clan), cost)) throw new GameError("The treasury can't cover that yet. Ask your clan to donate!", "not_enough");

  const db = await getDb();
  const tcol = TECH_COL[tech];
  // One statement: checks the level and the funds and pays, so two officers can't both buy it.
  const rs = await db.execute({
    sql: `UPDATE clans SET ${tcol} = ${tcol} + 1,
            ${TREASURY_KEYS.map((k) => `${TREASURY_COL[k]} = ${TREASURY_COL[k]} - ?`).join(", ")}
          WHERE id = ? AND ${tcol} = ? AND ${TREASURY_KEYS.map((k) => `${TREASURY_COL[k]} >= ?`).join(" AND ")}`,
    args: [...TREASURY_KEYS.map((k) => cost[k]), clanId, level, ...TREASURY_KEYS.map((k) => cost[k])],
  });

  if (rs.rowsAffected !== 1) throw new GameError("The treasury changed. Try again.", "conflict");
  await log(clanId, now, "tech", player.id, null, { tech, level: level + 1 });
  if (tech !== "hall") await syncClanPerks(clanId, now);

  return { tech: TECH_BY_ID[tech].name, level: level + 1 };
}

/** An officer sends resources or coins from the treasury to a member (not themselves). */
export async function sendAid(player: Player, body: any, now: number) {
  const target = Number(body?.id);
  const key = String(body?.key);

  if (!isTreasuryKey(key)) throw new GameError("Pick what to send", "bad_request");
  const amount = parseAmount(body?.amount);
  const { clanId } = await requireRole(player, can.manage, "Only the Jarl and Huscarls can send aid");

  if (target === player.id) throw new GameError("Aid goes to other members", "bad_request");
  const who = await findById(target);

  if (!who || who.clanId !== clanId) throw new GameError("That player isn't in your clan", "not_member");

  const db = await getDb();
  const col = TREASURY_COL[key];
  const rs = await db.execute({
    sql: `UPDATE clans SET ${col} = ${col} - ? WHERE id = ? AND ${col} >= ?`,
    args: [amount, clanId, amount],
  });

  if (rs.rowsAffected !== 1) throw new GameError(`The treasury doesn't have ${amount.toLocaleString("en-US")} ${keyName(key)}`, "not_enough");

  try {
    await mutatePlayer(target, now, (s) => {
      if (key === "coins") return { ...s, coins: s.coins + amount };
      if (!isResource(key)) return s;
      const room = getRates(s).capacity - s.resources[key];

      if (room < amount)
        throw new GameError(`Their warehouse only has room for ${Math.max(0, Math.floor(room)).toLocaleString("en-US")} ${keyName(key)}`, "no_room");

      return { ...s, resources: { ...s.resources, [key]: s.resources[key] + amount } };
    });
  } catch (e) {
    await db.execute({ sql: `UPDATE clans SET ${col} = ${col} + ? WHERE id = ?`, args: [amount, clanId] });
    throw e;
  }
  await log(clanId, now, "aid", player.id, target, { key, amount });
}

/** True if both players are in the same clan (no attacking your own). */
export async function sameClan(a: number, b: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT COUNT(DISTINCT clan_id) AS n, COUNT(clan_id) AS m FROM users WHERE id IN (?, ?)",
    args: [a, b],
  });

  return Number(rs.rows[0].m) === 2 && Number(rs.rows[0].n) === 1;
}

