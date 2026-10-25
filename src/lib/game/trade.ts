/**
 * Marketplace rules. Players post offers ("give 500 wood for 400 iron"); any
 * other player with a Trading Post can accept. The goods are locked when the
 * offer is posted, the buyer pays when accepting, and both loads travel across
 * the map with merchants and arrive later.
 *
 * Pure functions shared by the server (authoritative) and the client (to show
 * limits and validate the form before sending).
 */
import { RESOURCE_IDS, ResourceId } from "./config";
import { GameError, GameState, cloneState, getRates } from "./engine";

export const TRADING_POST = "trading-post";

/** Each Trading Post level adds one merchant: one more open offer and this much more per load. */
export const MERCHANT_CARRY = 1000;
/** Smallest amount worth sending a merchant for. */
export const MIN_TRADE_AMOUNT = 50;
/** Offers must ask between half and double what they give (stops gifting through the market). */
export const MIN_TRADE_RATIO = 0.5;
export const MAX_TRADE_RATIO = 2;
/** Merchants walk this many seconds per tile, and every trip takes at least MIN_TRADE_SECONDS. */
export const MERCHANT_SECONDS_PER_TILE = 15;
export const MIN_TRADE_SECONDS = 30;

export type Offer = {
  give: ResourceId;
  giveAmount: number;
  want: ResourceId;
  wantAmount: number;
};

export const tradingPostLevel = (s: GameState) =>
  s.buildings[TRADING_POST] ?? 0;

/** What this player's Trading Post allows. */
export const tradeLimits = (s: GameState) => {
  const level = tradingPostLevel(s);

  return { level, maxOffers: level, maxAmount: level * MERCHANT_CARRY };
};

export const tradeTravelMs = (tiles: number) =>
  Math.max(MIN_TRADE_SECONDS, Math.round(tiles * MERCHANT_SECONDS_PER_TILE)) *
  1000;

const isResource = (r: unknown): r is ResourceId =>
  RESOURCE_IDS.includes(r as ResourceId);

/** Cleans up a posted offer, or throws a GameError explaining what's wrong. */
export function parseOffer(raw: Partial<Record<keyof Offer, unknown>>): Offer {
  const give = raw.give;
  const want = raw.want;
  const giveAmount = Math.floor(Number(raw.giveAmount));
  const wantAmount = Math.floor(Number(raw.wantAmount));

  if (!isResource(give) || !isResource(want))
    throw new GameError("Pick what to give and what you want");
  if (give === want) throw new GameError("Trade two different resources");
  if (!(giveAmount >= MIN_TRADE_AMOUNT) || !(wantAmount >= MIN_TRADE_AMOUNT)) {
    throw new GameError(`Trade at least ${MIN_TRADE_AMOUNT} of each`);
  }
  const ratio = wantAmount / giveAmount;

  if (ratio < MIN_TRADE_RATIO || ratio > MAX_TRADE_RATIO) {
    throw new GameError("Ask for between half and double what you give");
  }

  return { give, giveAmount, want, wantAmount };
}

function requirePost(s: GameState, amount: number) {
  const { level, maxAmount } = tradeLimits(s);

  if (level < 1)
    throw new GameError("Build a Trading Post to trade", "no_trading_post");
  if (amount > maxAmount) {
    throw new GameError(
      `Your merchants carry up to ${maxAmount.toLocaleString("en-US")} at Trading Post level ${level}`,
    );
  }
}

function take(s: GameState, r: ResourceId, amount: number) {
  if (s.resources[r] < amount)
    throw new GameError(`Not enough ${r}`, "not_enough");
  s.resources[r] -= amount;
}

/** Posting an offer locks the goods. `openOffers` is how many the player already has open. */
export function postOffer(
  s0: GameState,
  o: Offer,
  openOffers: number,
): GameState {
  const s = cloneState(s0);

  requirePost(s, o.giveAmount);
  if (openOffers >= tradeLimits(s).maxOffers) {
    throw new GameError(
      "All your merchants are busy. Upgrade the Trading Post for more offers",
    );
  }
  take(s, o.give, o.giveAmount);

  return s;
}

/** Accepting an offer: the buyer pays what the seller wants. */
export function payForOffer(s0: GameState, o: Offer): GameState {
  const s = cloneState(s0);

  requirePost(s, o.wantAmount);
  take(s, o.want, o.wantAmount);

  return s;
}

/** Goods arriving (or a cancelled offer coming back). Storage still caps them. */
export function receiveGoods(
  s0: GameState,
  r: ResourceId,
  amount: number,
): GameState {
  const s = cloneState(s0);
  const cap = getRates(s).capacity;

  s.resources[r] = Math.max(
    s.resources[r],
    Math.min(cap, s.resources[r] + amount),
  );

  return s;
}
