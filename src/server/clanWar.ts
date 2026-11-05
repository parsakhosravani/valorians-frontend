import "server-only";

import crypto from "crypto";

import { getDb } from "./db";
import { logEvent, withEventContext } from "./events";
import { homeOf } from "./map";
import { sendToPlayer } from "./notify";
import { Player, findById, mutatePlayer } from "./players";

import { CLAN_WAR, UNITS } from "@/lib/game/config";
import { Army, GameError, advance, emptyArmy, getRates, ownArmy } from "@/lib/game/engine";
import { embark, fighterCount, returnHome, validateSend } from "@/lib/game/war";
import { routeMs, seaRoute } from "@/lib/game/map";
import { can, ClanRole } from "@/lib/game/clan";
import {
  RELATION_TEXT,
  RelationKind,
  blocksRaids,
  dispatchSupport,
  hasTroops,
  pairOf,
  receiveGuest,
  releaseGuest,
  strikeDeparture,
  updateAbroad,
  weekEnds,
  weekOf,
  weeklyGoal,
} from "@/lib/game/clanWar";
import { whole } from "@/lib/format";

/**
 * Clans fighting together (Nov 2026):
 * - reinforcements: troops guard a clanmate's village (support table + the
 *   host's `guests` and the owner's `abroad` in their states)
 * - attack alerts: the whole clan hears when a member is attacked
 * - rallies: armies sent to one land on the target together
 * - diplomacy: alliances and pacts (no raids between them), wars (scored)
 * - the weekly clan goal and what each member did toward it
 */

const rand = () => crypto.randomInt(0, 1_000_000) / 1_000_000;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const nameOf = (p: { username: string | null; firstName: string }) => p.firstName || (p.username ? `@${p.username}` : "Player");
const armyText = (a: Army) =>
  UNITS.filter((u) => (a[u.id] ?? 0) > 0)
    .map((u) => `${u.icon} ${whole(a[u.id])}`)
    .join("  ") || "nobody";
const inMinutes = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60000));

  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

async function roleIn(p: Player): Promise<{ clanId: number; role: ClanRole; tag: string } | null> {
  if (p.clanId == null) return null;
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT c.id, c.leader_id, c.tag, u.clan_role FROM users u JOIN clans c ON c.id = u.clan_id WHERE u.id = ?",
    args: [p.id],
  });
  const r = rs.rows[0];

  if (!r) return null;

  return {
    clanId: Number(r.id),
    tag: String(r.tag),
    role: Number(r.leader_id) === p.id ? "leader" : r.clan_role === "officer" ? "officer" : "member",
  };
}

async function requireOfficer(p: Player) {
  const m = await roleIn(p);

  if (!m) throw new GameError("You're not in a clan", "no_clan");
  if (!can.manage(m.role)) throw new GameError("Only the Jarl and Huscarls can do that", "not_allowed");

  return m;
}

async function clanLog(clanId: number, now: number, kind: string, actorId: number | null, targetId: number | null, data: object = {}) {
  const db = await getDb();

  logEvent(`clan.${kind}`, { clanId, targetId, ...data }, { playerId: actorId, at: now });
  await db
    .execute({
      sql: "INSERT INTO clan_log (clan_id, at, actor_id, target_id, kind, data) VALUES (?, ?, ?, ?, ?, ?)",
      args: [clanId, now, actorId, targetId, kind, JSON.stringify(data)],
    })
    .catch((e) => console.error("clan log", e));
}

// ─── Reinforcements ──────────────────────────────────────────────────────────

type SupportRow = {
  id: number;
  ownerId: number;
  hostId: number;
  units: Army;
  status: string;
  sentAt: number;
  arrivesAt: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

const toSupport = (r: Record<string, unknown>): SupportRow => ({
  id: Number(r.id),
  ownerId: Number(r.owner_id),
  hostId: Number(r.host_id),
  units: { ...emptyArmy(), ...JSON.parse(String(r.units)) },
  status: String(r.status),
  sentAt: Number(r.sent_at),
  arrivesAt: Number(r.arrives_at),
  from: { x: Number(r.from_x), y: Number(r.from_y) },
  to: { x: Number(r.to_x), y: Number(r.to_y) },
});

async function supportRow(id: number) {
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT * FROM support WHERE id = ?", args: [id] });

  return rs.rows[0] ? toSupport(rs.rows[0] as Record<string, unknown>) : null;
}

/** A member sends troops to guard a clanmate's village. */
export async function sendSupport(me: Player, body: any, now: number) {
  const hostId = Math.floor(Number(body?.to));

  if (!Number.isInteger(hostId) || hostId === me.id) throw new GameError("Pick a clanmate to guard", "bad_request");
  if (me.clanId == null) throw new GameError("Join a clan to guard clanmates", "no_clan");
  const host = await findById(hostId);

  if (!host || host.clanId !== me.clanId) throw new GameError("You can only guard members of your clan", "not_member");
  const [from, to] = await Promise.all([homeOf(me.id), homeOf(hostId)]);
  const units = { ...emptyArmy(), ...(body?.units ?? {}) } as Army;
  const naval = seaRoute(from, to, units).naval;
  const db = await getDb();
  // The row first, so the troops leaving home carry its id.
  const ins = await db.execute({
    sql: `INSERT INTO support (owner_id, host_id, units, status, sent_at, arrives_at, from_x, from_y, to_x, to_y)
          VALUES (?, ?, '{}', 'pending', ?, ?, ?, ?, ?, ?)`,
    args: [me.id, hostId, now, now, from.x, from.y, to.x, to.y],
  });
  const id = Number(ins.lastInsertRowid);
  let sent!: Army;
  let travel = 0;

  try {
    const after = await mutatePlayer(me.id, now, (s) => {
      travel = routeMs({ ...emptyArmy(), ...units }, from, to, getRates(s).marchMultiplier);
      const d = dispatchSupport(s, units, naval, { id, hostId, hostName: nameOf(host), status: "marching", arrivesAt: now + travel });

      sent = d.sent;

      return d.state;
    });

    await db.execute({
      sql: "UPDATE support SET units = ?, status = 'marching', arrives_at = ? WHERE id = ?",
      args: [JSON.stringify(sent), now + travel, id],
    });
    logEvent("support.send", { id, hostId, units: sent, travelMs: travel }, { playerId: me.id, at: now });
    await sendToPlayer(
      hostId,
      `🛡️ <b>${esc(nameOf(me))}</b> is sending troops to guard your village: ${armyText(sent)}\nThey arrive in <b>${inMinutes(travel)}</b>. Your village feeds them while they stay.`,
      "🛡️ Open clan",
      "/clan?tab=war"
    ).catch(() => {});

    return { player: after, support: { id, arrivesAt: now + travel } };
  } catch (e) {
    await db.execute({ sql: "DELETE FROM support WHERE id = ?", args: [id] });
    throw e;
  }
}

/**
 * Troops on guard duty go home: called back by their owner, or sent away by
 * the village they guard. On the road out, they turn around.
 */
export async function recallSupport(me: Player, body: any, now: number) {
  const id = Math.floor(Number(body?.id));
  const row = Number.isInteger(id) ? await supportRow(id) : null;

  if (!row || (row.ownerId !== me.id && row.hostId !== me.id) || row.status === "done" || row.status === "pending") {
    throw new GameError("Those troops aren't on guard duty", "not_found");
  }
  await sendHome(row, now, row.ownerId === me.id ? "recalled" : "dismissed");

  return (await findById(me.id)) ?? me;
}

/** Ends a guard duty: the troops walk home (turn back if still on the way). */
async function sendHome(row: SupportRow, now: number, why: "recalled" | "dismissed" | "clan" | "gone") {
  const db = await getDb();
  const claim = await db.execute({
    sql: "UPDATE support SET status = 'leaving' WHERE id = ? AND status = ?",
    args: [row.id, row.status],
  });

  if (claim.rowsAffected !== 1) throw new GameError("Those troops just moved. Try again.", "conflict");
  let units = row.units;
  let returnsAt: number;
  const host = await findById(row.hostId);
  const owner = await findById(row.ownerId);

  try {
    if (row.status === "stationed" && host) {
      await mutatePlayer(host.id, now, (s) => {
        const r = releaseGuest(s, row.id);

        units = r.units;

        return r.state;
      });
    }
  } catch (e) {
    await db.execute({ sql: "UPDATE support SET status = ? WHERE id = ?", args: [row.status, row.id] });
    throw e;
  }
  if (row.status === "marching") {
    // Turn around: as far back as they came.
    returnsAt = now + Math.max(0, now - row.sentAt);
  } else {
    returnsAt = now + routeMs(units, row.to, row.from, owner ? getRates(advance(owner.state, now)).marchMultiplier : 1);
  }
  if (owner) {
    await mutatePlayer(owner.id, now, (s) =>
      returnHome(updateAbroad(s, row.id, null), units, host ? `Guard duty at ${nameOf(host)}` : "Guard duty", returnsAt, now, rand(), row.to, now)
    );
  }
  await db.execute({ sql: "UPDATE support SET status = 'done', units = ? WHERE id = ?", args: [JSON.stringify(units), row.id] });
  logEvent("support.home", { id: row.id, why, units, returnsAt }, { playerId: row.ownerId, at: now });
  if (why === "dismissed" && owner && host) {
    await sendToPlayer(owner.id, `🏠 <b>${esc(nameOf(host))}</b> sent your guards home. They're back in ${inMinutes(returnsAt - now)}.`, "⚔️ Army", "/battle?tab=army").catch(() => {});
  }
  if (why === "clan" && owner) {
    await sendToPlayer(owner.id, `🏠 Your guards left ${host ? esc(nameOf(host)) : "a village"}: you're no longer in the same clan.`, "⚔️ Army", "/battle?tab=army").catch(() => {});
  }
}

/** Guards that reached the village take up their posts. */
export async function resolveSupport(now: number, playerId?: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT * FROM support WHERE status = 'marching' AND arrives_at <= ?${playerId == null ? "" : " AND (owner_id = ? OR host_id = ?)"}
          ORDER BY arrives_at ASC LIMIT 20`,
    args: playerId == null ? [now] : [now, playerId, playerId],
  });

  for (const r of rs.rows) {
    const row = toSupport(r as Record<string, unknown>);

    await withEventContext(`support:arrive #${row.id}`, async () => {
      const [owner, host] = await Promise.all([findById(row.ownerId), findById(row.hostId)]);

      if (!owner || !host || owner.clanId == null || owner.clanId !== host.clanId) {
        await sendHome(row, now, "clan").catch((e) => console.error("support home", row.id, e));

        return;
      }
      const claim = await db.execute({ sql: "UPDATE support SET status = 'arriving' WHERE id = ? AND status = 'marching'", args: [row.id] });

      if (claim.rowsAffected !== 1) return;
      try {
        await mutatePlayer(host.id, now, (s) =>
          receiveGuest(s, { id: row.id, ownerId: owner.id, ownerName: nameOf(owner), units: row.units, since: row.arrivesAt })
        );
      } catch (e) {
        // No room (too many guards): they go home.
        await db.execute({ sql: "UPDATE support SET status = 'marching' WHERE id = ?", args: [row.id] });
        await sendHome(row, now, "gone").catch(() => {});
        await sendToPlayer(owner.id, `🏠 Your guards couldn't stay with ${esc(nameOf(host))}: ${esc((e as Error).message)}. They're coming home.`).catch(() => {});

        return;
      }
      await db.execute({ sql: "UPDATE support SET status = 'stationed' WHERE id = ?", args: [row.id] });
      await mutatePlayer(owner.id, now, (s) => updateAbroad(s, row.id, { status: "stationed", arrivesAt: row.arrivesAt }));
      logEvent("support.arrive", { id: row.id, hostId: host.id, units: row.units }, { playerId: owner.id, at: now });
    }).catch((e) => console.error("support arrival", row.id, e));
  }
}

/**
 * Keeps each guard duty in line with the village it guards: losses in its
 * battles (or to hunger) reach the owner's record and the table, guards who
 * all fell are written off, and guards of a tribe that left the clan go home.
 * Run by the cron, and for one village right after it fought.
 */
export async function reconcileSupport(now: number, hostId?: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT * FROM support WHERE status = 'stationed'${hostId == null ? "" : " AND host_id = ?"} LIMIT 200`,
    args: hostId == null ? [] : [hostId],
  });

  for (const r of rs.rows) {
    const row = toSupport(r as Record<string, unknown>);

    try {
      const [owner, host] = await Promise.all([findById(row.ownerId), findById(row.hostId)]);

      if (!owner || !host || owner.clanId == null || owner.clanId !== host.clanId) {
        await sendHome(row, now, "clan").catch(() => {});
        continue;
      }
      const hs = advance(host.state, now);

      if (hs.defending?.length) continue; // fighting: settled when the battle ends
      const guest = (hs.guests ?? []).find((g) => g.id === row.id);
      const units = guest ? { ...emptyArmy(), ...guest.units } : emptyArmy();
      const same = UNITS.every((u) => (units[u.id] ?? 0) === (row.units[u.id] ?? 0));

      if (same) continue;
      const lost = emptyArmy();

      for (const u of UNITS) lost[u.id] = Math.max(0, (row.units[u.id] ?? 0) - (units[u.id] ?? 0));
      if (!hasTroops(units)) {
        await db.execute({ sql: "UPDATE support SET status = 'done', units = '{}' WHERE id = ?", args: [row.id] });
        await mutatePlayer(owner.id, now, (s) => updateAbroad(s, row.id, null));
      } else {
        await db.execute({ sql: "UPDATE support SET units = ? WHERE id = ?", args: [JSON.stringify(units), row.id] });
        await mutatePlayer(owner.id, now, (s) => updateAbroad(s, row.id, { units }));
      }
      logEvent("support.losses", { id: row.id, hostId: host.id, lost, left: units }, { playerId: owner.id, at: now });
      if (fighterCount(lost) > 0) {
        await sendToPlayer(
          owner.id,
          `⚔️ <b>Your guards at ${esc(nameOf(host))}'s village fought.</b>\nLost: ${armyText(lost)}\n` +
            (hasTroops(units) ? `Still on guard: ${armyText(units)}` : `None of them are left.`),
          "🛡️ Open clan",
          "/clan?tab=war"
        ).catch(() => {});
      }
    } catch (e) {
      console.error("reconcile support", row.id, e);
    }
  }
}

/** A tribe left (or was removed from) its clan: every guard duty it is part of ends. */
export async function endSupportOf(userId: number, now: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT * FROM support WHERE (owner_id = ? OR host_id = ?) AND status IN ('marching', 'stationed')",
    args: [userId, userId],
  });

  for (const r of rs.rows) await sendHome(toSupport(r as Record<string, unknown>), now, "clan").catch((e) => console.error("support end", e));
}

// ─── Attack alerts ───────────────────────────────────────────────────────────

/** Claims a quiet-period slot in `meta`: false if `key` fired within `quietMs`. */
async function claimSlot(key: string, now: number, quietMs: number) {
  const db = await getDb();
  const up = await db.execute({
    sql: "UPDATE meta SET value = ? WHERE key = ? AND CAST(value AS INTEGER) < ?",
    args: [String(now), key, now - quietMs],
  });

  if (up.rowsAffected === 1) return true;
  const ins = await db.execute({ sql: "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING", args: [key, String(now)] });

  return ins.rowsAffected === 1;
}

/**
 * A member is under attack: every clanmate hears it, with a button to send
 * guards. One alert per attacked tribe per CLAN_WAR.alertQuietMs.
 */
export async function alertClan(defenderId: number, attacker: string, travelMs: number, now: number) {
  const def = await findById(defenderId);

  if (!def || def.clanId == null) return 0;
  if (!(await claimSlot(`clan_alert:${defenderId}`, now, CLAN_WAR.alertQuietMs))) return 0;
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT id FROM users WHERE clan_id = ? AND id != ?", args: [def.clanId, defenderId] });

  await Promise.all(
    rs.rows.map((r) =>
      sendToPlayer(
        Number(r.id),
        `🚨 <b>${esc(nameOf(def))}</b> from your clan is under attack by <b>${esc(attacker)}</b>!\n` +
          `The army lands in <b>${inMinutes(travelMs)}</b>. Send troops to guard them.`,
        "🛡️ Send help",
        `/clan?tab=war&help=${defenderId}`
      ).catch(() => {})
    )
  );

  return rs.rows.length;
}

/** The clan's members under attack right now: who, by whom, when it lands. */
async function threats(clanId: number, now: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT a.id, a.defender_id, a.arrives_at, a.status, au.first_name AS a_name, du.first_name AS d_name
          FROM attacks a JOIN users du ON du.id = a.defender_id JOIN users au ON au.id = a.attacker_id
          WHERE du.clan_id = ? AND a.status IN ('marching', 'fighting') ORDER BY a.arrives_at ASC LIMIT 20`,
    args: [clanId],
  });

  return rs.rows.map((r) => ({
    id: Number(r.id),
    defenderId: Number(r.defender_id),
    defender: String(r.d_name || "A chief"),
    attacker: String(r.a_name || "A chief"),
    arrivesAt: Number(r.arrives_at),
    fighting: String(r.status) === "fighting" || Number(r.arrives_at) <= now,
  }));
}

// ─── Rallies ─────────────────────────────────────────────────────────────────

/** An officer calls a clan strike on a tribe: armies sent to it land at `landAt`. */
export async function createRally(me: Player, body: any, now: number) {
  const m = await requireOfficer(me);
  const targetId = Math.floor(Number(body?.target));
  const landAt = Math.floor(Number(body?.landAt));
  const note = String(body?.note ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const target = Number.isInteger(targetId) ? await findById(targetId) : null;

  if (!target) throw new GameError("Pick a tribe to strike", "bad_request");
  if (target.clanId === m.clanId) throw new GameError("Clanmates don't raid each other", "same_clan");
  if (target.clanId != null && blocksRaids((await relationBetween(m.clanId, target.clanId))?.kind)) {
    throw new GameError("Your clan has a treaty with theirs", "treaty");
  }
  if (!Number.isFinite(landAt) || landAt < now + CLAN_WAR.rallyMinLeadMs || landAt > now + CLAN_WAR.rallyMaxLeadMs) {
    throw new GameError(
      `Set the landing time between ${CLAN_WAR.rallyMinLeadMs / 60e3} minutes and ${CLAN_WAR.rallyMaxLeadMs / 3600e3} hours from now`,
      "bad_time"
    );
  }
  if (advance(target.state, now).shieldUntil > landAt) {
    throw new GameError("They're shielded past that time: pick a landing after their shield drops", "shielded");
  }
  const db = await getDb();
  const open = await db.execute({ sql: "SELECT COUNT(*) AS n FROM clan_rallies WHERE clan_id = ? AND land_at > ?", args: [m.clanId, now] });

  if (Number(open.rows[0].n) >= CLAN_WAR.maxRallies) throw new GameError(`A clan can call ${CLAN_WAR.maxRallies} strikes at once`, "too_many");
  const ins = await db.execute({
    sql: "INSERT INTO clan_rallies (clan_id, target_id, land_at, created_by, created_at, note) VALUES (?, ?, ?, ?, ?, ?)",
    args: [m.clanId, targetId, landAt, me.id, now, note],
  });
  const id = Number(ins.lastInsertRowid);

  await clanLog(m.clanId, now, "rally", me.id, targetId, { landAt });
  const members = await db.execute({ sql: "SELECT id FROM users WHERE clan_id = ? AND id != ?", args: [m.clanId, me.id] });

  await Promise.all(
    members.rows.map((r) =>
      sendToPlayer(
        Number(r.id),
        `📯 <b>${esc(nameOf(me))}</b> calls a clan strike on <b>${esc(nameOf(target))}</b>!\n` +
          // In time from now, not a UTC clock time (players read it in their own time zone).
          `All armies land together in <b>${inMinutes(landAt - now)}</b>. Join now: your army waits at home and sets out just in time.${note ? `\n“${esc(note)}”` : ""}`,
        "⚔️ Join the strike",
        `/battle?attack=${targetId}&rally=${id}&land=${landAt}`
      ).catch(() => {})
    )
  );

  return { id };
}

/** An officer calls off a strike (armies already sent keep marching). */
export async function cancelRally(me: Player, body: any, now: number) {
  const m = await requireOfficer(me);
  const db = await getDb();
  const rs = await db.execute({ sql: "DELETE FROM clan_rallies WHERE id = ? AND clan_id = ?", args: [Math.floor(Number(body?.id)), m.clanId] });

  if (rs.rowsAffected !== 1) throw new GameError("No such strike", "not_found");
  // Armies still waiting at home stay there.
  await db.execute({ sql: "UPDATE rally_musters SET status = 'cancelled' WHERE rally_id = ? AND status = 'waiting'", args: [Math.floor(Number(body?.id))] });
  await clanLog(m.clanId, now, "rally_off", me.id, null);
}

/**
 * For marchTo: an army sent to rally `rallyId` slows down to land with the
 * others. Returns the landing time, after checking the rally is this clan's,
 * on this target, and not over.
 */
export async function rallyLanding(me: Player, rallyId: number, defenderId: number | null, now: number): Promise<{ landAt: number; createdAt: number }> {
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT * FROM clan_rallies WHERE id = ?", args: [rallyId] });
  const r = rs.rows[0];

  if (!r || me.clanId == null || Number(r.clan_id) !== me.clanId) throw new GameError("That strike isn't your clan's", "not_found");
  if (Number(r.target_id) !== defenderId) throw new GameError("That strike is on another tribe", "bad_request");
  if (Number(r.land_at) <= now) throw new GameError("That strike has already landed", "too_late");

  return { landAt: Number(r.land_at), createdAt: Number(r.created_at) };
}

async function rallies(clanId: number, now: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT r.*, t.first_name AS t_name, t.username AS t_user, c.first_name AS c_name
          FROM clan_rallies r JOIN users t ON t.id = r.target_id LEFT JOIN users c ON c.id = r.created_by
          WHERE r.clan_id = ? AND r.land_at > ? ORDER BY r.land_at ASC`,
    args: [clanId, now - 3600e3],
  });
  const ids = rs.rows.map((r) => Number(r.id));
  const waiting = ids.length
    ? await db.execute({
        sql: `SELECT m.id, m.rally_id, m.user_id, m.units, m.depart_at, u.first_name FROM rally_musters m JOIN users u ON u.id = m.user_id
              WHERE m.rally_id IN (${ids.map(() => "?").join(",")}) AND m.status = 'waiting'`,
        args: ids,
      })
    : { rows: [] };
  const joined = ids.length
    ? await db.execute({
        sql: `SELECT a.rally_id, a.attacker_id, a.units, a.arrives_at, u.first_name FROM attacks a JOIN users u ON u.id = a.attacker_id
              WHERE a.rally_id IN (${ids.map(() => "?").join(",")})`,
        args: ids,
      })
    : { rows: [] };

  return rs.rows.map((r) => ({
    id: Number(r.id),
    targetId: Number(r.target_id),
    target: String(r.t_name || (r.t_user ? `@${r.t_user}` : "A tribe")),
    landAt: Number(r.land_at),
    note: String(r.note ?? ""),
    by: String(r.c_name || "An officer"),
    armies: joined.rows
      .filter((j) => Number(j.rally_id) === Number(r.id))
      .map((j) => ({
        playerId: Number(j.attacker_id),
        name: String(j.first_name || "A chief"),
        troops: fighterCount(JSON.parse(String(j.units))),
        arrivesAt: Number(j.arrives_at),
        /** On the road (null), or waiting at home to set out then. */
        departAt: null as number | null,
        musterId: null as number | null,
      }))
      .concat(
        waiting.rows
          .filter((w) => Number(w.rally_id) === Number(r.id))
          .map((w) => ({
            playerId: Number(w.user_id),
            name: String(w.first_name || "A chief"),
            troops: fighterCount(JSON.parse(String(w.units))),
            arrivesAt: Number(r.land_at),
            departAt: Number(w.depart_at),
            musterId: Number(w.id),
          }))
      ),
  }));
}

/**
 * Joins a clan strike. Far from the landing time, the army waits at home
 * (still defending it) and sets out just in time (resolveMusters): the target
 * gets the usual warning, not hours to prepare or buy a shield. Returns null
 * when it's time to set out now (the caller marches it straight away).
 */
export async function joinStrike(me: Player, rallyId: number, targetId: number, units: Army, now: number) {
  const { landAt } = await rallyLanding(me, rallyId, targetId, now);
  const [from, to] = await Promise.all([homeOf(me.id), homeOf(targetId)]);
  const s = advance(me.state, now);
  // Checked now, so a bad pick fails at once rather than hours later.
  const naval = seaRoute(from, to, units).naval;
  const sent = embark(s, validateSend(s, { ...emptyArmy(), ...units }), naval);
  const { departAt } = strikeDeparture(sent, from, to, landAt, getRates(s).marchMultiplier);

  if (departAt <= now + 60e3) return null;
  const db = await getDb();
  const dup = await db.execute({
    sql: "SELECT 1 FROM rally_musters WHERE rally_id = ? AND user_id = ? AND status = 'waiting' LIMIT 1",
    args: [rallyId, me.id],
  });

  if (dup.rows.length) throw new GameError("Your army already waits for this strike. Call it off first to change it.", "busy");
  const ins = await db.execute({
    sql: `INSERT INTO rally_musters (rally_id, user_id, target_id, units, depart_at, land_at, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?)`,
    args: [rallyId, me.id, targetId, JSON.stringify(units), departAt, landAt, now],
  });

  logEvent("rally.muster", { rallyId, targetId, units, departAt, landAt }, { playerId: me.id, at: now });

  return { id: Number(ins.lastInsertRowid), departAt, landAt };
}

/** A member takes back the army waiting at home for a strike. */
export async function leaveStrike(me: Player, body: any) {
  const db = await getDb();
  const rs = await db.execute({
    sql: "UPDATE rally_musters SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'waiting'",
    args: [Math.floor(Number(body?.id)), me.id],
  });

  if (rs.rowsAffected !== 1) throw new GameError("That army isn't waiting for a strike", "not_found");
}

/**
 * Armies waiting for a strike whose time has come set out now, with what is
 * at home of what was picked (some may have fallen, or been sent elsewhere).
 * Run on every sweep and by the cron.
 */
export async function resolveMusters(now: number, playerId?: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT * FROM rally_musters WHERE status = 'waiting' AND depart_at <= ?${playerId == null ? "" : " AND user_id = ?"}
          ORDER BY depart_at ASC LIMIT 20`,
    args: playerId == null ? [now] : [now, playerId],
  });
  // Loaded here: war.ts itself uses this module.
  const { marchTo } = await import("./war");

  for (const r of rs.rows) {
    const id = Number(r.id);
    const claim = await db.execute({ sql: "UPDATE rally_musters SET status = 'leaving' WHERE id = ? AND status = 'waiting'", args: [id] });

    if (claim.rowsAffected !== 1) continue;
    const me = await findById(Number(r.user_id));
    let status = "failed";
    let why = "";

    try {
      if (!me) throw new GameError("Tribe gone");
      const want = { ...emptyArmy(), ...JSON.parse(String(r.units)) } as Army;
      const home = ownArmy(advance(me.state, now));
      const units = emptyArmy();

      for (const u of UNITS) units[u.id] = Math.max(0, Math.min(want[u.id] ?? 0, home[u.id] ?? 0));
      if (fighterCount(units) === 0) throw new GameError("None of the troops you picked are at home any more");
      await withEventContext(`rally:depart #${id}`, () =>
        marchTo(me, { target: Number(r.target_id), rally: Number(r.rally_id) }, units, now)
      );
      status = "gone";
    } catch (e) {
      why = (e as Error).message;
      logEvent("rally.depart_failed", { id, why }, { playerId: Number(r.user_id), at: now, level: e instanceof GameError ? "warn" : "error" });
    }
    await db.execute({ sql: "UPDATE rally_musters SET status = ? WHERE id = ?", args: [status, id] });
    if (status === "failed" && me) {
      await sendToPlayer(me.id, `📯 Your army couldn't set out for the clan strike: ${esc(why)}`, "🛡️ Open clan", "/clan?tab=war").catch(() => {});
    }
  }
}

// ─── Diplomacy ───────────────────────────────────────────────────────────────

type Relation = { a: number; b: number; kind: RelationKind; status: string; proposedBy: number; endsAt: number | null; scoreA: number; scoreB: number };

const toRelation = (r: Record<string, unknown>): Relation => ({
  a: Number(r.a),
  b: Number(r.b),
  kind: String(r.kind) as RelationKind,
  status: String(r.status),
  proposedBy: Number(r.proposed_by),
  endsAt: r.ends_at == null ? null : Number(r.ends_at),
  scoreA: Number(r.score_a ?? 0),
  scoreB: Number(r.score_b ?? 0),
});

/** The relation in force between two clans (proposals don't count), or null. A war past its end is over. */
export async function relationBetween(x: number, y: number, now = Date.now()): Promise<Relation | null> {
  const [a, b] = pairOf(x, y);
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT * FROM clan_relations WHERE a = ? AND b = ?", args: [a, b] });
  const r = rs.rows[0] ? toRelation(rs.rows[0] as Record<string, unknown>) : null;

  if (!r) return null;
  if (r.kind === "war" && r.endsAt != null && r.endsAt <= now) return null;
  if (r.kind !== "war" && r.status !== "active") return null;

  return r;
}

/** Clans that `clanId` may not raid (allies and pacts in force), for target lists and the map. */
export async function protectedClans(clanId: number | null): Promise<Set<number>> {
  if (clanId == null) return new Set();
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT a, b FROM clan_relations WHERE (a = ? OR b = ?) AND kind IN ('ally', 'nap') AND status = 'active'",
    args: [clanId, clanId],
  });

  return new Set(rs.rows.map((r) => (Number(r.a) === clanId ? Number(r.b) : Number(r.a))));
}

/** Every relation of a clan, for the map's colours: other clan id → kind. */
export async function relationsOf(clanId: number | null, now = Date.now()): Promise<Map<number, RelationKind>> {
  if (clanId == null) return new Map();
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT * FROM clan_relations WHERE a = ? OR b = ?", args: [clanId, clanId] });
  const out = new Map<number, RelationKind>();

  for (const row of rs.rows) {
    const r = toRelation(row as Record<string, unknown>);
    const other = r.a === clanId ? r.b : r.a;

    if (r.kind === "war" ? r.endsAt == null || r.endsAt > now : r.status === "active") out.set(other, r.kind);
  }

  return out;
}

async function clanByIdOrTag(v: unknown) {
  const db = await getDb();
  const n = Number(v);
  const rs = Number.isInteger(n) && n > 0
    ? await db.execute({ sql: "SELECT id, name, tag FROM clans WHERE id = ?", args: [n] })
    : await db.execute({ sql: "SELECT id, name, tag FROM clans WHERE UPPER(tag) = UPPER(?)", args: [String(v ?? "")] });
  const r = rs.rows[0];

  if (!r) throw new GameError("No clan with that tag", "not_found");

  return { id: Number(r.id), name: String(r.name), tag: String(r.tag) };
}

async function tellOfficers(clanId: number, html: string) {
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT u.id FROM users u JOIN clans c ON c.id = u.clan_id WHERE u.clan_id = ? AND (u.id = c.leader_id OR u.clan_role = 'officer')`,
    args: [clanId],
  });

  await Promise.all(rs.rows.map((r) => sendToPlayer(Number(r.id), html, "🛡️ Open clan", "/clan?tab=war").catch(() => {})));
}

/**
 * Officers manage their clan's relations with another clan:
 * - `ally` / `nap`: propose (or accept the other clan's same proposal)
 * - `accept` / `decline`: answer a proposal
 * - `war`: declare war (breaks any treaty); `peace`: offer peace, or accept theirs
 * - `end`: break a treaty, or withdraw a proposal
 */
export async function diplomacy(me: Player, body: any, now: number) {
  const m = await requireOfficer(me);
  const other = await clanByIdOrTag(body?.clan);
  const action = String(body?.action);

  if (other.id === m.clanId) throw new GameError("That's your own clan", "bad_request");
  const [a, b] = pairOf(m.clanId, other.id);
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT * FROM clan_relations WHERE a = ? AND b = ?", args: [a, b] });
  const cur = rs.rows[0] ? toRelation(rs.rows[0] as Record<string, unknown>) : null;
  const live = cur && !(cur.kind === "war" && cur.endsAt != null && cur.endsAt <= now) ? cur : null;
  const mine = (await db.execute({ sql: "SELECT tag FROM clans WHERE id = ?", args: [m.clanId] })).rows[0];
  const myTag = String(mine?.tag ?? "?");
  const put = (kind: RelationKind, status: string, endsAt: number | null = null) =>
    db.execute({
      sql: `INSERT INTO clan_relations (a, b, kind, status, proposed_by, created_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(a, b) DO UPDATE SET kind = excluded.kind, status = excluded.status, proposed_by = excluded.proposed_by,
              created_at = excluded.created_at, ends_at = excluded.ends_at, score_a = 0, score_b = 0`,
      args: [a, b, kind, status, m.clanId, now, endsAt],
    });
  const drop = () => db.execute({ sql: "DELETE FROM clan_relations WHERE a = ? AND b = ?", args: [a, b] });

  if (action === "ally" || action === "nap") {
    if (live?.kind === "war") throw new GameError(`You're at war with [${other.tag}]. Make peace first.`, "at_war");
    if (live?.status === "active") throw new GameError(`You already have a ${RELATION_TEXT[live.kind].name.toLowerCase()} with [${other.tag}]`, "exists");
    const treaties = await db.execute({
      sql: "SELECT COUNT(*) AS n FROM clan_relations WHERE (a = ? OR b = ?) AND kind IN ('ally','nap') AND status = 'active'",
      args: [m.clanId, m.clanId],
    });

    if (Number(treaties.rows[0].n) >= CLAN_WAR.maxTreaties) throw new GameError(`A clan can hold ${CLAN_WAR.maxTreaties} treaties at once`, "too_many");
    // They already asked for the same: that's a yes.
    if (live && live.status === "proposed" && live.kind === action && live.proposedBy === other.id) {
      await db.execute({ sql: "UPDATE clan_relations SET status = 'active' WHERE a = ? AND b = ?", args: [a, b] });
      await clanLog(m.clanId, now, "treaty", me.id, null, { kind: action, tag: other.tag });
      await clanLog(other.id, now, "treaty", null, null, { kind: action, tag: myTag });
      await tellOfficers(other.id, `${RELATION_TEXT[action].icon} <b>[${esc(myTag)}]</b> accepted: your ${RELATION_TEXT[action].name.toLowerCase()} is in force.`);

      return { status: "active" };
    }
    await put(action, "proposed");
    await tellOfficers(other.id, `${RELATION_TEXT[action].icon} <b>[${esc(myTag)}]</b> proposes a <b>${RELATION_TEXT[action].name.toLowerCase()}</b> with your clan.`);

    return { status: "proposed" };
  }
  if (action === "accept" || action === "decline") {
    if (!live || live.status !== "proposed" || live.proposedBy === m.clanId) throw new GameError("No proposal from that clan", "not_found");
    if (action === "decline") {
      await drop();
      await tellOfficers(other.id, `✖️ <b>[${esc(myTag)}]</b> declined your proposal.`);

      return { status: "none" };
    }
    await db.execute({ sql: "UPDATE clan_relations SET status = 'active' WHERE a = ? AND b = ?", args: [a, b] });
    await clanLog(m.clanId, now, "treaty", me.id, null, { kind: live.kind, tag: other.tag });
    await clanLog(other.id, now, "treaty", null, null, { kind: live.kind, tag: myTag });
    await tellOfficers(other.id, `${RELATION_TEXT[live.kind].icon} <b>[${esc(myTag)}]</b> accepted: your ${RELATION_TEXT[live.kind].name.toLowerCase()} is in force.`);

    return { status: "active" };
  }
  if (action === "war") {
    if (live?.kind === "war") throw new GameError(`You're already at war with [${other.tag}]`, "exists");
    await put("war", "active", now + CLAN_WAR.warMs);
    await clanLog(m.clanId, now, "war", me.id, null, { tag: other.tag });
    await clanLog(other.id, now, "war", null, null, { tag: myTag, against: true });
    await tellOfficers(other.id, `🔥 <b>[${esc(myTag)}] declared war on your clan!</b> Raid wins between you now score war points.`);

    return { status: "war" };
  }
  if (action === "peace") {
    if (live?.kind !== "war") throw new GameError(`You're not at war with [${other.tag}]`, "not_found");
    // Peace offered by them: accepted.
    if (live.status === "peace" && live.proposedBy === other.id) {
      await drop();
      await clanLog(m.clanId, now, "peace", me.id, null, { tag: other.tag, score: [live.scoreA, live.scoreB] });
      await clanLog(other.id, now, "peace", null, null, { tag: myTag });
      await tellOfficers(other.id, `🕊️ <b>[${esc(myTag)}]</b> accepted peace. The war is over.`);

      return { status: "none" };
    }
    await db.execute({ sql: "UPDATE clan_relations SET status = 'peace', proposed_by = ? WHERE a = ? AND b = ?", args: [m.clanId, a, b] });
    await tellOfficers(other.id, `🕊️ <b>[${esc(myTag)}]</b> offers peace. Accept it on the Clan screen.`);

    return { status: "peace" };
  }
  if (action === "end") {
    if (!cur) throw new GameError("Nothing to end with that clan", "not_found");
    if (cur.kind === "war" && live) throw new GameError("A war ends with peace (or by itself after a week)", "at_war");
    await drop();
    if (cur.status === "active") {
      await clanLog(m.clanId, now, "treaty_end", me.id, null, { kind: cur.kind, tag: other.tag });
      await tellOfficers(other.id, `💔 <b>[${esc(myTag)}]</b> broke your ${RELATION_TEXT[cur.kind].name.toLowerCase()}.`);
    }

    return { status: "none" };
  }
  throw new GameError("Unknown action", "bad_request");
}

/** A raid between clans at war scores a war point for the winner's clan. */
export async function scoreWar(attackerClan: number | null, defenderClan: number | null, attackerWon: boolean, now: number) {
  if (attackerClan == null || defenderClan == null || attackerClan === defenderClan) return;
  const r = await relationBetween(attackerClan, defenderClan, now);

  if (r?.kind !== "war") return;
  const winner = attackerWon ? attackerClan : defenderClan;
  const db = await getDb();

  await db.execute({
    sql: `UPDATE clan_relations SET ${winner === r.a ? "score_a = score_a + 1" : "score_b = score_b + 1"} WHERE a = ? AND b = ?`,
    args: [r.a, r.b],
  });
}

async function relationsView(clanId: number, now: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT r.*, ca.name AS a_name, ca.tag AS a_tag, cb.name AS b_name, cb.tag AS b_tag FROM clan_relations r
          JOIN clans ca ON ca.id = r.a JOIN clans cb ON cb.id = r.b WHERE r.a = ? OR r.b = ?`,
    args: [clanId, clanId],
  });

  return rs.rows
    .map((row) => {
      const r = toRelation(row as Record<string, unknown>);
      const usA = r.a === clanId;

      return {
        clanId: usA ? r.b : r.a,
        name: String(usA ? row.b_name : row.a_name),
        tag: String(usA ? row.b_tag : row.a_tag),
        kind: r.kind,
        status: r.status,
        /** Who asked: us or them (for proposals and peace offers). */
        byUs: r.proposedBy === clanId,
        endsAt: r.endsAt,
        score: usA ? [r.scoreA, r.scoreB] : [r.scoreB, r.scoreA],
      };
    })
    .filter((r) => !(r.kind === "war" && r.endsAt != null && r.endsAt <= now));
}

// ─── The weekly goal ─────────────────────────────────────────────────────────

/**
 * Counts something a member did for the clan this week (a camp cleared, a raid
 * won, resources donated), then pays the weekly goal if the clan just met it.
 */
export async function recordForClan(userId: number, clanId: number | null, what: "camps" | "wins" | "donated", n: number, now: number) {
  if (clanId == null || !(n > 0)) return;
  const db = await getDb();
  const week = weekOf(now);

  await db.execute({
    sql: `INSERT INTO clan_week (clan_id, week, user_id, ${what}) VALUES (?, ?, ?, ?)
          ON CONFLICT(clan_id, week, user_id) DO UPDATE SET ${what} = ${what} + excluded.${what}`,
    args: [clanId, week, userId, n],
  });
  await maybePayGoal(clanId, week, now);
}

async function goalProgress(clanId: number, week: number) {
  const db = await getDb();
  const [count, sums] = await db.batch(
    [
      { sql: "SELECT COUNT(*) AS n FROM users WHERE clan_id = ?", args: [clanId] },
      {
        sql: "SELECT COALESCE(SUM(camps), 0) AS camps, COALESCE(SUM(wins), 0) AS wins, COALESCE(SUM(donated), 0) AS donated FROM clan_week WHERE clan_id = ? AND week = ?",
        args: [clanId, week],
      },
    ],
    "read"
  );
  const goal = weeklyGoal(week, Number(count.rows[0].n));
  const done = Number(sums.rows[0][goal.kind] ?? 0);

  return { ...goal, done: Math.floor(done), members: Number(count.rows[0].n) };
}

async function maybePayGoal(clanId: number, week: number, now: number) {
  const g = await goalProgress(clanId, week);

  if (g.done < g.target) return;
  const db = await getDb();
  const claim = await db.execute({
    sql: "INSERT INTO clan_week_done (clan_id, week, at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
    args: [clanId, week, now],
  });

  if (claim.rowsAffected !== 1) return;
  const members = await db.execute({ sql: "SELECT id FROM users WHERE clan_id = ?", args: [clanId] });

  await clanLog(clanId, now, "goal", null, null, { kind: g.kind, coins: g.coins });
  for (const r of members.rows) {
    const id = Number(r.id);

    await mutatePlayer(id, now, (s) => ({ ...s, coins: s.coins + g.coins })).catch((e) => console.error("weekly goal pay", id, e));
    await sendToPlayer(id, `🏆 <b>Your clan met this week's goal!</b>\n+${whole(g.coins)} coins for every member.`, "🛡️ Open clan", "/clan?tab=war").catch(() => {});
  }
}

async function weekView(clanId: number, now: number) {
  const week = weekOf(now);
  const db = await getDb();
  const [g, board, done] = await Promise.all([
    goalProgress(clanId, week),
    db.execute({
      sql: `SELECT w.user_id, w.camps, w.wins, w.donated, u.first_name FROM clan_week w JOIN users u ON u.id = w.user_id
            WHERE w.clan_id = ? AND w.week = ? AND u.clan_id = ?`,
      args: [clanId, week, clanId],
    }),
    db.execute({ sql: "SELECT 1 FROM clan_week_done WHERE clan_id = ? AND week = ?", args: [clanId, week] }),
  ]);

  return {
    goal: { ...g, paid: done.rows.length > 0, endsAt: weekEnds(week) },
    board: board.rows
      .map((r) => ({
        id: Number(r.user_id),
        name: String(r.first_name || "A chief"),
        camps: Number(r.camps),
        wins: Number(r.wins),
        donated: Math.floor(Number(r.donated)),
      }))
      .sort((x, y) => y.wins * 3 + y.camps + y.donated / 20_000 - (x.wins * 3 + x.camps + x.donated / 20_000)),
  };
}

// ─── The War tab ─────────────────────────────────────────────────────────────

/** Everything the clan's War tab shows: threats, guard duties, strikes, relations and the week. */
export async function clanWarView(me: Player, now: number) {
  if (me.clanId == null) return null;
  const clanId = me.clanId;
  const db = await getDb();
  const guards = await db.execute({
    sql: `SELECT s.id, s.owner_id, s.host_id, s.units, s.status, s.arrives_at, o.first_name AS o_name, h.first_name AS h_name
          FROM support s JOIN users o ON o.id = s.owner_id JOIN users h ON h.id = s.host_id
          WHERE (o.clan_id = ? OR h.clan_id = ?) AND s.status IN ('marching', 'stationed') ORDER BY s.arrives_at ASC LIMIT 100`,
    args: [clanId, clanId],
  });
  const [t, r, rel, wk] = await Promise.all([threats(clanId, now), rallies(clanId, now), relationsView(clanId, now), weekView(clanId, now)]);

  return {
    threats: t,
    rallies: r,
    relations: rel,
    week: wk,
    guards: guards.rows.map((g) => ({
      id: Number(g.id),
      ownerId: Number(g.owner_id),
      owner: String(g.o_name || "A chief"),
      hostId: Number(g.host_id),
      host: String(g.h_name || "A chief"),
      troops: fighterCount(JSON.parse(String(g.units))),
      status: String(g.status) as "marching" | "stationed",
      arrivesAt: Number(g.arrives_at),
    })),
  };
}

export type ClanWarView = NonNullable<Awaited<ReturnType<typeof clanWarView>>>;
