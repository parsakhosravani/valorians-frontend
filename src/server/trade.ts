import "server-only";

import type { Row } from "@libsql/client";

import crypto from "crypto";

import { exposureOn, lairManned, roadWatch } from "./bandits";
import { getDb } from "./db";
import { homeOf } from "./map";
import { notify } from "./notify";
import { Player, avatarUrl, findById, mutatePlayer } from "./players";
import { displayName } from "./war";

import { ResourceId, guardCost } from "@/lib/game/config";
import { GameError, advance } from "@/lib/game/engine";
import { distance } from "@/lib/game/map";
import { Robbery, rollRobbery } from "@/lib/game/bandits";
import {
  Offer,
  hireGuards,
  parseOffer,
  payForOffer,
  postOffer,
  receiveGoods,
  refundGuards,
  tradeLimits,
  tradeTravelMs,
} from "@/lib/game/trade";

type TradeRow = Offer & {
  id: number;
  sellerId: number;
  buyerId: number | null;
  status: "open" | "accepted" | "delivering" | "delivered" | "cancelled";
  createdAt: number;
  acceptedAt: number | null;
  arrivesAt: number | null;
  /** Guards escort the load coming to the seller / to the buyer. */
  guardSeller: boolean;
  guardBuyer: boolean;
  /** Bandits robbing the seller's load (on its way to the buyer) / the buyer's (on its way to the seller). */
  robA: Robbery | null;
  robB: Robbery | null;
};

const rand = () => crypto.randomInt(0, 1_000_000) / 1_000_000;

const json = <T,>(v: unknown): T | null => (v == null ? null : (JSON.parse(String(v)) as T));

/** What bandits actually took from a load (nothing until they've struck, or if they were cleared out first). */
export const stolenFrom = (r: Robbery | null) => (r?.done && !r.foiled ? r.stolen : 0);

/** A robbery as players may see it: only once it has happened. */
const shown = (r: Robbery | null) => (r?.done && !r.foiled ? r : null);

const num = (v: unknown) => (v == null ? null : Number(v));

const toTrade = (r: Row): TradeRow => ({
  id: Number(r.id),
  sellerId: Number(r.seller_id),
  buyerId: num(r.buyer_id),
  give: String(r.give) as ResourceId,
  giveAmount: Number(r.give_amount),
  want: String(r.want) as ResourceId,
  wantAmount: Number(r.want_amount),
  status: String(r.status) as TradeRow["status"],
  createdAt: Number(r.created_at),
  acceptedAt: num(r.accepted_at),
  arrivesAt: num(r.arrives_at),
  guardSeller: Number(r.guard_seller ?? 0) === 1,
  guardBuyer: Number(r.guard_buyer ?? 0) === 1,
  robA: json<Robbery>(r.rob_a),
  robB: json<Robbery>(r.rob_b),
});

async function openCount(sellerId: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM trades WHERE seller_id = ? AND status = 'open'",
    args: [sellerId],
  });

  return Number(rs.rows[0].n);
}

async function getTrade(id: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT * FROM trades WHERE id = ?",
    args: [id],
  });

  if (!rs.rows[0]) throw new GameError("That offer is gone", "not_found");

  return toTrade(rs.rows[0]);
}

/** Posts an offer and locks the goods. */
export async function postTrade(
  me: Player,
  raw: Record<string, unknown>,
  now: number,
) {
  const o = parseOffer(raw);
  // Guards escort the goods the seller gets back, whoever the buyer turns out to be.
  const guard = raw.guard === true;
  const open = await openCount(me.id);
  const p = await mutatePlayer(me.id, now, (s) => {
    const posted = postOffer(s, o, open);

    return guard ? hireGuards(posted, o.wantAmount) : posted;
  });
  const db = await getDb();

  try {
    await db.execute({
      sql: `INSERT INTO trades (seller_id, give, give_amount, want, want_amount, created_at, guard_seller)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [me.id, o.give, o.giveAmount, o.want, o.wantAmount, now, guard ? 1 : 0],
    });
  } catch (e) {
    await mutatePlayer(me.id, now, (s) => {
      const back = receiveGoods(s, o.give, o.giveAmount);

      return guard ? refundGuards(back, o.wantAmount) : back;
    }).catch(() => {});
    throw e;
  }

  return p;
}

/** Takes an open offer off the market and gives the goods back. */
export async function cancelTrade(me: Player, id: number, now: number) {
  const db = await getDb();
  const claim = await db.execute({
    sql: "UPDATE trades SET status = 'cancelled' WHERE id = ? AND seller_id = ? AND status = 'open'",
    args: [id, me.id],
  });

  if (claim.rowsAffected !== 1)
    throw new GameError(
      "That offer was already taken or cancelled",
      "not_found",
    );
  const t = await getTrade(id);

  return mutatePlayer(me.id, now, (s) => {
    const back = receiveGoods(s, t.give, t.giveAmount);

    return t.guardSeller ? refundGuards(back, t.wantAmount) : back;
  });
}

/** Buys an offer: the buyer pays now, and both loads set off with merchants. */
export async function acceptTrade(me: Player, id: number, now: number, guard = false) {
  const t = await getTrade(id);

  if (t.status !== "open")
    throw new GameError("Someone else took that offer first", "taken");
  if (t.sellerId === me.id) throw new GameError("That's your own offer");

  // Pay first (this checks the Trading Post and the goods), then claim the
  // offer; if someone beat us to it, give the payment back.
  let p = await mutatePlayer(me.id, now, (s) => {
    const paid = payForOffer(s, t);

    return guard ? hireGuards(paid, t.giveAmount) : paid;
  });
  const [from, to] = await Promise.all([homeOf(t.sellerId), homeOf(me.id)]);
  const arrivesAt = now + tradeTravelMs(distance(from, to));
  const trip = { startedAt: now, endsAt: arrivesAt };
  // Bandits on the road may be waiting for either load (decided now, sprung when the merchants pass).
  const [there, back] = await Promise.all([exposureOn(from, to, null, now), exposureOn(to, from, null, now)]);
  const robA = rollRobbery(there, t.giveAmount, guard, trip, rand);
  const robB = rollRobbery(back, t.wantAmount, t.guardSeller, trip, rand);
  const robAt = [robA?.at, robB?.at].filter((x): x is number => x != null);
  const db = await getDb();
  const claim = await db.execute({
    sql: `UPDATE trades SET status = 'accepted', buyer_id = ?, accepted_at = ?, arrives_at = ?,
                            guard_buyer = ?, rob_a = ?, rob_b = ?, rob_at = ?
          WHERE id = ? AND status = 'open'`,
    args: [
      me.id,
      now,
      arrivesAt,
      guard ? 1 : 0,
      robA ? JSON.stringify(robA) : null,
      robB ? JSON.stringify(robB) : null,
      robAt.length ? Math.min(...robAt) : null,
      id,
    ],
  });

  if (claim.rowsAffected !== 1) {
    p = await mutatePlayer(me.id, now, (s) => {
      const back = receiveGoods(s, t.want, t.wantAmount);

      return guard ? refundGuards(back, t.giveAmount) : back;
    });
    throw new GameError("Someone else took that offer first", "taken");
  }
  await notify
    .tradeAccepted(t.sellerId, displayName(me), t, arrivesAt - now)
    .catch(() => {});

  return p;
}

/** Hands over every load whose merchants have arrived (with `playerId`: only that player's). */
export async function resolveDueTrades(now: number, playerId?: number) {
  const db = await getDb();
  const mine = playerId == null ? "" : " AND (seller_id = ? OR buyer_id = ?)";

  // Bandits strike before the merchants arrive.
  await springRobberies(now, playerId);
  const rs = await db.execute({
    sql: `SELECT * FROM trades WHERE status = 'accepted' AND arrives_at <= ?${mine} ORDER BY arrives_at ASC LIMIT 20`,
    args: playerId == null ? [now] : [now, playerId, playerId],
  });

  for (const row of rs.rows) {
    const t = toTrade(row);
    const claim = await db.execute({
      sql: "UPDATE trades SET status = 'delivering' WHERE id = ? AND status = 'accepted'",
      args: [t.id],
    });

    if (claim.rowsAffected !== 1 || t.buyerId == null) continue;
    try {
      // What the bandits took doesn't arrive.
      await mutatePlayer(t.sellerId, now, (s) =>
        receiveGoods(s, t.want, t.wantAmount - stolenFrom(t.robB)),
      );
      await mutatePlayer(t.buyerId, now, (s) =>
        receiveGoods(s, t.give, t.giveAmount - stolenFrom(t.robA)),
      );
      await db.execute({
        sql: "UPDATE trades SET status = 'delivered' WHERE id = ?",
        args: [t.id],
      });
    } catch (e) {
      // Put it back so the next request retries the delivery.
      // eslint-disable-next-line no-console
      console.error("trade delivery failed", t.id, e);
      await db.execute({
        sql: "UPDATE trades SET status = 'accepted' WHERE id = ?",
        args: [t.id],
      });
    }
  }
}

/**
 * Springs the robberies whose merchants are passing the bandits by now. If
 * the lair was cleared before they got there, nothing happens. The player
 * the load was going to hears about it.
 */
async function springRobberies(now: number, playerId?: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: `SELECT t.*, su.first_name AS s_name, bu.first_name AS b_name FROM trades t
          LEFT JOIN users su ON su.id = t.seller_id LEFT JOIN users bu ON bu.id = t.buyer_id
          WHERE t.status = 'accepted' AND t.rob_at IS NOT NULL AND t.rob_at <= ?${playerId == null ? "" : " AND (t.seller_id = ? OR t.buyer_id = ?)"}
          ORDER BY t.rob_at ASC LIMIT 20`,
    args: playerId == null ? [now] : [now, playerId, playerId],
  });
  for (const row of rs.rows) {
    const t = toTrade(row);
    const spring = async (r: Robbery | null) =>
      r && !r.done && r.at <= now ? { ...r, done: true, foiled: !(await lairManned(r, r.at)) } : r;
    const robA = await spring(t.robA);
    const robB = await spring(t.robB);
    const next = [robA, robB].filter((r) => r && !r.done).map((r) => r!.at);
    const claim = await db.execute({
      sql: "UPDATE trades SET rob_a = ?, rob_b = ?, rob_at = ? WHERE id = ? AND status = 'accepted' AND rob_at = ?",
      args: [
        robA ? JSON.stringify(robA) : null,
        robB ? JSON.stringify(robB) : null,
        next.length ? Math.min(...next) : null,
        t.id,
        Number(row.rob_at),
      ],
    });

    if (claim.rowsAffected !== 1 || t.buyerId == null) continue;
    const name = (v: unknown) => String(v || "a tribe");

    // Tell whoever the robbed load was going to, once.
    if (robA && !t.robA?.done && !robA.foiled) {
      await notify.robbed(t.buyerId, t.give, robA.stolen, t.giveAmount - robA.stolen, name(row.s_name)).catch(() => {});
    }
    if (robB && !t.robB?.done && !robB.foiled) {
      await notify.robbed(t.sellerId, t.want, robB.stolen, t.wantAmount - robB.stolen, name(row.b_name)).catch(() => {});
    }
  }
}

const who = async (id: number | null) => {
  const p = id == null ? null : await findById(id);

  return p ? { id: p.id, name: displayName(p), photoUrl: avatarUrl(p.id) } : null;
};

/** Everything the Trade page shows. */
export async function marketView(me: Player, now: number) {
  const db = await getDb();
  const home = await homeOf(me.id);
  const [market, mine] = await db.batch(
    [
      {
        sql: `SELECT t.*, u.username, u.first_name, u.photo_url, u.map_x, u.map_y
              FROM trades t JOIN users u ON u.id = t.seller_id
              WHERE t.status = 'open' AND t.seller_id != ?
              ORDER BY t.created_at DESC LIMIT 60`,
        args: [me.id],
      },
      {
        sql: `SELECT * FROM trades
              WHERE (seller_id = ? OR buyer_id = ?)
                AND (status IN ('open', 'accepted', 'delivering') OR (status = 'delivered' AND arrives_at > ?))
              ORDER BY created_at DESC LIMIT 40`,
        args: [me.id, me.id, now - 24 * 3600 * 1000],
      },
    ],
    "read",
  );
  const state = advance(me.state, now);
  const mineRows = mine.rows.map(toTrade);
  const watch = await roadWatch(now);
  // Robberies stay secret until they happen.
  const open = ({ robA: _a, robB: _b, ...t }: TradeRow) => t;

  return {
    serverTime: now,
    limits: {
      ...tradeLimits(state),
      openOffers: mineRows.filter(
        (t) => t.status === "open" && t.sellerId === me.id,
      ).length,
    },
    market: market.rows.map((r) => {
      const t = toTrade(r);
      const at = { x: Number(r.map_x ?? home.x), y: Number(r.map_y ?? home.y) };
      const tiles = distance(home, at);

      return {
        ...open(t),
        /** Manned bandit lairs on the road your goods would come along. */
        bandits: watch(at, home, null).length,
        guardCost: guardCost(t.giveAmount),
        seller: {
          id: t.sellerId,
          name: displayName({
            username: r.username == null ? null : String(r.username),
            firstName: String(r.first_name ?? ""),
          }),
          photoUrl: avatarUrl(t.sellerId),
        },
        tiles: Math.round(tiles * 10) / 10,
        travelMs: tradeTravelMs(tiles),
      };
    }),
    mine: await Promise.all(
      mineRows.map(async (t) => {
        const selling = t.sellerId === me.id;

        return {
          ...open(t),
          selling,
          /** Guards escort the load coming to you. */
          guarded: selling ? t.guardSeller : t.guardBuyer,
          /** Bandits robbed the load coming to you / the one you sent. */
          robbed: shown(selling ? t.robB : t.robA),
          robbedOut: shown(selling ? t.robA : t.robB),
          other: await who(selling ? t.buyerId : t.sellerId),
        };
      }),
    ),
  };
}

export type MarketView = Awaited<ReturnType<typeof marketView>>;
