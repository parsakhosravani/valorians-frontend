import "server-only";

import { getDb } from "./db";
import { Player, avatarUrl, findById, mutatePlayer } from "./players";

import { CLAN } from "@/lib/game/config";
import { GameError } from "@/lib/game/engine";

/**
 * Clans: players band together under a name and a short tag.
 * - anyone without a clan can found one (costs coins) or join an open one
 * - the founder leads; only the leader can remove members
 * - when the leader leaves, the longest-serving member takes over; the last
 *   member to leave disbands the clan
 * Membership is users.clan_id, so a player is in at most one clan.
 */

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

const memberName = (r: Record<string, unknown>) =>
  String(r.first_name || (r.username ? `@${r.username}` : "Player"));

/** Clans with their size and strength, strongest first. */
const CLAN_TOTALS = `
  SELECT c.id, c.name, c.tag, c.description, c.leader_id, c.created_at,
         COUNT(u.id) AS members,
         COALESCE(SUM(u.population), 0) AS population,
         COALESCE(SUM(u.power), 0) AS power
  FROM clans c LEFT JOIN users u ON u.clan_id = c.id
  GROUP BY c.id`;

type ClanRow = Record<string, unknown>;

const summary = (r: ClanRow) => ({
  id: Number(r.id),
  name: String(r.name),
  tag: String(r.tag),
  description: String(r.description ?? ""),
  leaderId: Number(r.leader_id),
  members: Number(r.members),
  population: Math.floor(Number(r.population)),
  power: Math.floor(Number(r.power)),
  createdAt: Number(r.created_at),
});

export type ClanSummary = ReturnType<typeof summary>;

/** Everything the Clan screen needs: your clan (with members) and clans to browse. */
export async function clanView(player: Player, search?: string) {
  const db = await getDb();
  const q = clean(search).slice(0, CLAN.nameMax);
  const list = await db.execute({
    sql: `SELECT * FROM (${CLAN_TOTALS}) t
          ${q ? "WHERE t.name LIKE ? OR t.tag LIKE ?" : ""}
          ORDER BY t.population DESC, t.id ASC LIMIT 50`,
    args: q ? [`%${q}%`, `%${q}%`] : [],
  });

  let mine = null;

  if (player.clanId != null) {
    const [own, members, rank] = await db.batch(
      [
        { sql: `SELECT * FROM (${CLAN_TOTALS}) t WHERE t.id = ?`, args: [player.clanId] },
        {
          sql: `SELECT id, username, first_name, population, power, clan_joined_at
                FROM users WHERE clan_id = ? ORDER BY population DESC, id ASC`,
          args: [player.clanId],
        },
        {
          sql: `SELECT COUNT(*) + 1 AS rank FROM (${CLAN_TOTALS}) t
                WHERE t.population > (SELECT COALESCE(SUM(population), 0) FROM users WHERE clan_id = ?)`,
          args: [player.clanId],
        },
      ],
      "read"
    );

    if (own.rows[0]) {
      const c = summary(own.rows[0]);

      mine = {
        ...c,
        rank: Number(rank.rows[0].rank),
        members: members.rows.map((m) => ({
          id: Number(m.id),
          name: memberName(m),
          photoUrl: avatarUrl(Number(m.id)),
          population: Math.floor(Number(m.population)),
          power: Math.floor(Number(m.power)),
          isLeader: Number(m.id) === c.leaderId,
          joinedAt: m.clan_joined_at == null ? null : Number(m.clan_joined_at),
        })),
      };
    }
  }

  return { mine, clans: list.rows.map(summary), limits: CLAN };
}

export type ClanView = Awaited<ReturnType<typeof clanView>>;

/** Founds a clan with the player as leader. Charges CLAN.createCost coins. */
export async function createClan(player: Player, body: any, now: number): Promise<Player> {
  const name = clean(body?.name);
  const tag = clean(body?.tag).toUpperCase();
  const description = clean(body?.description).slice(0, CLAN.descriptionMax);

  if (player.clanId != null) throw new GameError("Leave your clan before founding a new one", "in_clan");
  if (name.length < CLAN.nameMin || name.length > CLAN.nameMax)
    throw new GameError(`Clan name must be ${CLAN.nameMin}-${CLAN.nameMax} characters`, "bad_name");
  if (!/^[\p{L}\p{N} '._-]+$/u.test(name)) throw new GameError("Clan name has characters that aren't allowed", "bad_name");
  if (tag.length < CLAN.tagMin || tag.length > CLAN.tagMax || !/^[A-Z0-9]+$/.test(tag))
    throw new GameError(`Tag must be ${CLAN.tagMin}-${CLAN.tagMax} letters or digits`, "bad_tag");
  if (player.state.coins < CLAN.createCost)
    throw new GameError(`You need ${CLAN.createCost.toLocaleString("en-US")} coins to found a clan`, "not_enough_coins");

  const db = await getDb();
  let clanId: number;

  try {
    const rs = await db.execute({
      sql: "INSERT INTO clans (name, tag, description, leader_id, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [name, tag, description, player.id, now],
    });

    clanId = Number(rs.lastInsertRowid);
  } catch (e) {
    const msg = String((e as Error).message);

    if (/clans\.name/i.test(msg)) throw new GameError("A clan with that name already exists", "name_taken");
    if (/clans\.tag/i.test(msg)) throw new GameError("That tag is already taken", "tag_taken");
    throw e;
  }

  const join = await db.execute({
    sql: "UPDATE users SET clan_id = ?, clan_joined_at = ? WHERE id = ? AND clan_id IS NULL",
    args: [clanId, now, player.id],
  });

  if (join.rowsAffected !== 1) {
    await db.execute({ sql: "DELETE FROM clans WHERE id = ?", args: [clanId] });
    throw new GameError("Leave your clan before founding a new one", "in_clan");
  }

  try {
    return await mutatePlayer(player.id, now, (s) => {
      if (s.coins < CLAN.createCost)
        throw new GameError(`You need ${CLAN.createCost.toLocaleString("en-US")} coins to found a clan`, "not_enough_coins");

      return { ...s, coins: s.coins - CLAN.createCost };
    }).then((p) => ({ ...p, clanId }));
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

/** Joins a clan if the player has none and it has room. */
export async function joinClan(player: Player, body: any, now: number): Promise<Player> {
  const clanId = Number(body?.id);

  if (!Number.isInteger(clanId)) throw new GameError("Pick a clan to join", "bad_request");
  if (player.clanId != null) throw new GameError("Leave your clan before joining another", "in_clan");
  const db = await getDb();
  const exists = await db.execute({ sql: "SELECT id FROM clans WHERE id = ?", args: [clanId] });

  if (!exists.rows[0]) throw new GameError("That clan no longer exists", "not_found");

  // One statement so two players can't squeeze into the last seat together.
  const rs = await db.execute({
    sql: `UPDATE users SET clan_id = ?, clan_joined_at = ?
          WHERE id = ? AND clan_id IS NULL
            AND (SELECT COUNT(*) FROM users WHERE clan_id = ?) < ?`,
    args: [clanId, now, player.id, clanId, CLAN.maxMembers],
  });

  if (rs.rowsAffected !== 1) {
    const again = await findById(player.id);

    if (again?.clanId != null) throw new GameError("Leave your clan before joining another", "in_clan");
    throw new GameError(`That clan is full (${CLAN.maxMembers} members)`, "clan_full");
  }

  return { ...player, clanId };
}

/** Leaves the clan. A leader hands over to the longest-serving member; the last one out disbands it. */
export async function leaveClan(player: Player): Promise<Player> {
  const clanId = player.clanId;

  if (clanId == null) throw new GameError("You're not in a clan", "no_clan");
  const db = await getDb();

  await db.execute({
    sql: "UPDATE users SET clan_id = NULL, clan_joined_at = NULL WHERE id = ? AND clan_id = ?",
    args: [player.id, clanId],
  });

  const clan = await db.execute({ sql: "SELECT leader_id FROM clans WHERE id = ?", args: [clanId] });

  if (clan.rows[0] && Number(clan.rows[0].leader_id) === player.id) {
    const heir = await db.execute({
      sql: "SELECT id FROM users WHERE clan_id = ? ORDER BY clan_joined_at ASC, id ASC LIMIT 1",
      args: [clanId],
    });

    if (heir.rows[0]) {
      await db.execute({
        sql: "UPDATE clans SET leader_id = ? WHERE id = ?",
        args: [Number(heir.rows[0].id), clanId],
      });
    } else {
      await db.execute({ sql: "DELETE FROM clans WHERE id = ?", args: [clanId] });
    }
  }

  return { ...player, clanId: null };
}

/** The leader removes a member. */
export async function kickMember(player: Player, body: any): Promise<void> {
  const target = Number(body?.id);

  if (player.clanId == null) throw new GameError("You're not in a clan", "no_clan");
  if (!Number.isInteger(target) || target === player.id) throw new GameError("Pick a member to remove", "bad_request");
  const db = await getDb();
  const clan = await db.execute({ sql: "SELECT leader_id FROM clans WHERE id = ?", args: [player.clanId] });

  if (Number(clan.rows[0]?.leader_id) !== player.id) throw new GameError("Only the clan leader can remove members", "not_leader");
  const rs = await db.execute({
    sql: "UPDATE users SET clan_id = NULL, clan_joined_at = NULL WHERE id = ? AND clan_id = ?",
    args: [target, player.clanId],
  });

  if (rs.rowsAffected !== 1) throw new GameError("That player isn't in your clan", "not_member");
}
