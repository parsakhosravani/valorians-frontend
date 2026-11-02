import "server-only";

import { getDb } from "./db";

import { Point, resettleSpot } from "@/lib/game/map";

/**
 * Moves the villages already on the map a few tiles to better land (see
 * resettleSpot): off the old settling grid, and off water or mountains the
 * redrawn world put them on. Done once per village, a batch per cron run, in
 * player order (cursor in meta `resettle_v1_cursor`).
 *
 * A village with an army marching or fighting, to or from it, or a trade on
 * the road, isn't moved now (that would break the march or the delivery): it
 * waits in meta `resettle_v1_later` and is tried again on later runs. Only
 * the home tile changes; buildings, troops and stores stay as they are, and
 * camps and bandit lairs follow the new spot by themselves.
 */
export async function resettleVillages(budgetMs = 8_000, perRun = 150) {
  const db = await getDb();
  const started = Date.now();
  const meta = async (key: string) => (await db.execute({ sql: "SELECT value FROM meta WHERE key = ?", args: [key] })).rows[0]?.value;
  const setMeta = (key: string, value: string) =>
    db.execute({
      sql: "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [key, value],
    });
  const cursor = Number((await meta("resettle_v1_cursor")) ?? 0);
  const later: number[] = JSON.parse(String((await meta("resettle_v1_later")) ?? "[]"));

  if (cursor < 0 && !later.length) return 0; // everyone's done
  const homes = (await db.execute("SELECT id, map_x, map_y FROM users WHERE map_x IS NOT NULL")).rows.map((r) => ({
    id: Number(r.id),
    x: Number(r.map_x),
    y: Number(r.map_y),
  }));
  const busy = new Set(
    (
      await db.execute(
        `SELECT attacker_id AS id FROM attacks WHERE status IN ('marching', 'resolving', 'fighting')
         UNION SELECT defender_id FROM attacks WHERE status IN ('marching', 'resolving', 'fighting') AND defender_id IS NOT NULL
         UNION SELECT seller_id FROM trades WHERE status = 'delivering'
         UNION SELECT buyer_id FROM trades WHERE status = 'delivering' AND buyer_id IS NOT NULL`,
      )
    ).rows.map((r) => Number(r.id)),
  );
  // Waiting ones first, then onwards from the cursor.
  const queue = [
    ...later.map((id) => homes.find((h) => h.id === id)).filter((h): h is (typeof homes)[number] => !!h),
    ...(cursor >= 0 ? homes.filter((h) => h.id > cursor).sort((a, b) => a.id - b.id) : []),
  ].slice(0, perRun);
  const stillLater: number[] = [];
  let lastId = cursor;
  let moved = 0;

  for (const h of queue) {
    if (Date.now() - started > budgetMs) break;
    if (!later.includes(h.id)) lastId = h.id;
    if (busy.has(h.id)) {
      stillLater.push(h.id);
      continue;
    }
    const others: Point[] = homes.filter((o) => o.id !== h.id);
    const to = resettleSpot(h, others);

    if (to.x === h.x && to.y === h.y) continue;
    // Only if the tile is still free, and the village hasn't moved meanwhile.
    const up = await db.execute({
      sql: `UPDATE users SET map_x = ?, map_y = ? WHERE id = ? AND map_x = ? AND map_y = ?
            AND NOT EXISTS (SELECT 1 FROM users WHERE map_x = ? AND map_y = ?)`,
      args: [to.x, to.y, h.id, h.x, h.y, to.x, to.y],
    });

    if (up.rowsAffected === 1) {
      h.x = to.x;
      h.y = to.y;
      moved++;
    }
  }
  // Waiting villages not reached this run stay waiting.
  const untried = later.filter((id) => !queue.some((h) => h.id === id));
  const allDone = cursor >= 0 && !homes.some((h) => h.id > lastId);

  await setMeta("resettle_v1_cursor", String(allDone ? -1 : lastId));
  await setMeta("resettle_v1_later", JSON.stringify([...untried, ...stillLater]));

  return moved;
}
