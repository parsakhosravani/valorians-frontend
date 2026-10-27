import { action } from "@/server/http";
import { buyOrdersCard } from "@/lib/game/war";

/** Raises the War Orders card one level: one more new order per expedition. */
export const POST = action((s) => buyOrdersCard(s));
