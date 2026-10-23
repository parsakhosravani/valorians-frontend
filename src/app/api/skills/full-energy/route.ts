import { action } from "@/server/http";
import { refillEnergy } from "@/lib/game/engine";

export const POST = action((s, { now }) => refillEnergy(s, now));
