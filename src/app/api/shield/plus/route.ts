import { action } from "@/server/http";

import { claimPlusShield } from "@/lib/game/engine";

export const dynamic = "force-dynamic";

/** Raises the free weekly shield that comes with Valorians Plus. */
export const POST = action((s, { now }) => claimPlusShield(s, now));
