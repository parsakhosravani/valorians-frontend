import "server-only";

import { lairManned, lairsAround, clearLair } from "./bandits";
import { notify } from "./notify";
import { Player, mutatePlayer } from "./players";

import { BANDIT_RAID } from "@/lib/game/config";
import { gatherBanditRaid, raidersNear, resolveBanditRaid } from "@/lib/game/bandits";
import { advance } from "@/lib/game/engine";
import { defensePower } from "@/lib/game/war";

/**
 * Bandit raids on a player's village (see BANDIT_RAID), run when the player
 * opens the game: a raid that has arrived is fought at its arrival time, and
 * if none is under way and one is due, bandits from a manned lair nearby may
 * start gathering. Both are told on Telegram. Returns the player as saved.
 *
 * Done on the player's own visits, so raids only find players who play: one
 * who's away for a week comes back to at most the one raid that was due.
 */
export async function banditWatch(player: Player, now: number): Promise<Player> {
  let p = player;
  const raid = p.state.banditRaid;

  // Their lair cleared while they gathered (by the player or anyone): the raid is off at once.
  const off = raid && now < raid.arrivesAt && !(await lairManned(raid, now));

  if (raid && (now >= raid.arrivesAt || off)) {
    const manned = off ? false : await lairManned(raid, raid.arrivesAt);
    let cleared = false;

    // Fought as things stood when they arrived (or as soon after as the save allows).
    p = await mutatePlayer(p.id, off ? now : Math.max(raid.arrivesAt, p.state.updatedAt), (s) => {
      const out = resolveBanditRaid(s, manned, Math.random);

      cleared = out.cleared;

      return out.state;
    }, p);
    if (cleared) await clearLair(raid, p.id, raid.arrivesAt);
    if (p.state.banditReport) await notify.banditRaidResult(p.id, p.state.banditReport).catch(() => undefined);
  }

  const s = p.state;

  if (!p.home || s.banditRaid || now < (s.banditNextAt ?? 0) || s.shieldUntil > now) return p;
  const r = BANDIT_RAID.reach;
  const lairs = raidersNear(
    p.home,
    await lairsAround({ x: p.home.x - r, y: p.home.y - r }, { x: p.home.x + r, y: p.home.y + r }, now),
  );
  const next = await mutatePlayer(p.id, now, (st) => gatherBanditRaid(st, lairs, now, Math.random), p);

  if (next.state.banditRaid && !s.banditRaid)
    await notify.banditsGathering(next.id, next.state.banditRaid, Math.round(defensePower(advance(next.state, now)))).catch(() => undefined);

  return next;
}
