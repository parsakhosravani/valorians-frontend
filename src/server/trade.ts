import "server-only";

import type { Row } from "@libsql/client";

import { getDb } from "./db";
import { homeOf } from "./map";
import { notify } from "./notify";
import { Player, findById, mutatePlayer } from "./players";
import { displayName } from "./war";

import type { ResourceId } from "@/lib/game/config";
import { GameError, advance } from "@/lib/game/engine";
import { distance } from "@/lib/game/map";
import {
  Offer,
  parseOffer,
  payForOffer,
  postOffer,
  receiveGoods,
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
};

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
  const open = await openCount(me.id);
  const p = await mutatePlayer(me.id, now, (s) => postOffer(s, o, open));
  const db = await getDb();

  await db.execute({
    sql: `INSERT INTO trades (seller_id, give, give_amount, want, want_amount, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [me.id, o.give, o.giveAmount, o.want, o.wantAmount, now],
  });

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

  return mutatePlayer(me.id, now, (s) => receiveGoods(s, t.give, t.giveAmount));
}

/** Buys an offer: the buyer pays now, and both loads set off with merchants. */
export async function acceptTrade(me: Player, id: number, now: number) {
  const t = await getTrade(id);

  if (t.status !== "open")
    throw new GameError("Someone else took that offer first", "taken");
  if (t.sellerId === me.id) throw new GameError("That's your own offer");

  // Pay first (this checks the Trading Post and the goods), then claim the
  // offer; if someone beat us to it, give the payment back.
  let p = await mutatePlayer(me.id, now, (s) => payForOffer(s, t));
  const [from, to] = await Promise.all([homeOf(t.sellerId), homeOf(me.id)]);
  const arrivesAt = now + tradeTravelMs(distance(from, to));
  const db = await getDb();
  const claim = await db.execute({
    sql: `UPDATE trades SET status = 'accepted', buyer_id = ?, accepted_at = ?, arrives_at = ?
          WHERE id = ? AND status = 'open'`,
    args: [me.id, now, arrivesAt, id],
  });

  if (claim.rowsAffected !== 1) {
    p = await mutatePlayer(me.id, now, (s) =>
      receiveGoods(s, t.want, t.wantAmount),
    );
    throw new GameError("Someone else took that offer first", "taken");
  }
  await notify
    .tradeAccepted(t.sellerId, displayName(me), t, arrivesAt - now)
    .catch(() => {});

  return p;
}

/** Hands over every load whose merchants have arrived. */
export async function resolveDueTrades(now: number) {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT * FROM trades WHERE status = 'accepted' AND arrives_at <= ? ORDER BY arrives_at ASC LIMIT 20",
    args: [now],
  });

  for (const row of rs.rows) {
    const t = toTrade(row);
    const claim = await db.execute({
      sql: "UPDATE trades SET status = 'delivering' WHERE id = ? AND status = 'accepted'",
      args: [t.id],
    });

    if (claim.rowsAffected !== 1 || t.buyerId == null) continue;
    try {
      await mutatePlayer(t.sellerId, now, (s) =>
        receiveGoods(s, t.want, t.wantAmount),
      );
      await mutatePlayer(t.buyerId, now, (s) =>
        receiveGoods(s, t.give, t.giveAmount),
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

const who = async (id: number | null) => {
  const p = id == null ? null : await findById(id);

  return p ? { id: p.id, name: displayName(p), photoUrl: p.photoUrl } : null;
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
        ...t,
        seller: {
          id: t.sellerId,
          name: displayName({
            username: r.username == null ? null : String(r.username),
            firstName: String(r.first_name ?? ""),
          }),
          photoUrl: r.photo_url == null ? null : String(r.photo_url),
        },
        tiles: Math.round(tiles * 10) / 10,
        travelMs: tradeTravelMs(tiles),
      };
    }),
    mine: await Promise.all(
      mineRows.map(async (t) => {
        const selling = t.sellerId === me.id;

        return {
          ...t,
          selling,
          other: await who(selling ? t.buyerId : t.sellerId),
        };
      }),
    ),
  };
}

export type MarketView = Awaited<ReturnType<typeof marketView>>;
