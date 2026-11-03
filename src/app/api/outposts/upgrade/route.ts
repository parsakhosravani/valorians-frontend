import { action } from "@/server/http";
import { upgradeField } from "@/lib/game/engine";
import type { ResourceId } from "@/lib/game/config";

/** Body: { outpost, resource }. Raises one field of an outpost with its own builder. */
export const POST = action((s, { body, now }) => upgradeField(s, Number(body.outpost), String(body.resource) as ResourceId, now));
