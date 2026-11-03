import { action } from "@/server/http";
import { exchange } from "@/lib/game/trade";

/** Body: { give, want, amount }. Swaps with the Merchant of the North at once, at a loss (EXCHANGE_RATE). */
export const POST = action((s, { body }) => exchange(s, body.give, body.want, body.amount));
