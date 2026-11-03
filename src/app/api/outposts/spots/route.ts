import { handler } from "@/server/http";
import { offeredSpots } from "@/server/outposts";

/** The spots offered for the tribe's next outpost: the best land for each resource, nearest first. */
export const GET = handler(async ({ player }) => ({ spots: await offeredSpots(player) }));
