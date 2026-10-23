import { handler } from "@/server/http";
import { findTargets } from "@/server/war";

export const dynamic = "force-dynamic";

/** Tribes you can attack right now, closest to your strength first. */
export const GET = handler(async ({ player, now }) => ({ targets: await findTargets(player, now) }));
