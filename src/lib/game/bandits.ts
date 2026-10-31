/**
 * Bandits: lairs in the wilds between villages, and the ambushes they spring
 * on merchants and armies whose road passes close by.
 *
 * Where lairs are is worked out from the map itself (the same for everyone,
 * on client and server), minus the ones too close to a village. Whether a lair
 * is occupied right now, and every roll of the dice, is the server's business.
 */
import { BANDIT, BANDIT_RAID, RESOURCE_IDS, UNIT_BY_ID, UNIT_IDS, banditStrength, banditTheft, lairBounty } from "./config";
import { Army, BanditRaidReport, GameState, cloneState, emptyArmy, getRates, totalArmy } from "./engine";
import { MarchRoute, Point, TERRAIN, distance, hash, inMap, routeTimeline, terrainAt } from "./map";
import { Loot, applyBattleXp, attackPower, battleXp, defensePower, luckFrom } from "./war";

export type Lair = Point & { level: number };

/** Lairs' levels: most are small gangs, a few are strongholds. */
const LEVEL_ODDS = [0.35, 0.6, 0.8, 0.92, 1];

const walkable = (p: Point) => {
  const t = terrainAt(p.x, p.y);

  return t !== "sea" && TERRAIN[t].march != null;
};

/** The lair of one square of the world, if it has one (before villages are taken into account). */
export function lairOfCell(cx: number, cy: number): Lair | null {
  if (hash(cx, cy, 41) >= BANDIT.spawn) return null;
  const c = BANDIT.cell;

  // A few tries inside the square, away from its edges, for walkable ground.
  for (let k = 0; k < 4; k++) {
    const p = {
      x: cx * c + 2 + Math.floor(hash(cx, cy, 42 + k * 2) * (c - 4)),
      y: cy * c + 2 + Math.floor(hash(cx, cy, 43 + k * 2) * (c - 4)),
    };

    if (inMap(p) && walkable(p)) {
      const roll = hash(cx, cy, 51);
      const level = Math.min(BANDIT.maxLevel, LEVEL_ODDS.findIndex((o) => roll < o) + 1);

      return { ...p, level };
    }
  }

  return null;
}

/**
 * Every lair inside the box (corners included), leaving out the ones too
 * close to a village. `tribes` must hold every village within
 * BANDIT.tribeDistance of the box.
 */
export function lairsIn(min: Point, max: Point, tribes: Point[]): Lair[] {
  const c = BANDIT.cell;
  const out: Lair[] = [];

  for (let cy = Math.floor(min.y / c); cy <= Math.floor(max.y / c); cy++) {
    for (let cx = Math.floor(min.x / c); cx <= Math.floor(max.x / c); cx++) {
      const l = lairOfCell(cx, cy);

      if (!l || l.x < min.x || l.y < min.y || l.x > max.x || l.y > max.y) continue;
      if (tribes.some((t) => distance(t, l) < BANDIT.tribeDistance)) continue;
      out.push(l);
    }
  }

  return out;
}

/** The box round a road where lairs could reach it. */
export function routeBox(r: MarchRoute) {
  const pad = Math.ceil(BANDIT.reach);
  const xs = r.path.map((p) => p.x);
  const ys = r.path.map((p) => p.y);

  return {
    min: { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad },
    max: { x: Math.max(...xs) + pad, y: Math.max(...ys) + pad },
  };
}

export type Exposure = { lair: Lair; /** Share of the trip's time when the traveller passes it. */ f: number };

/**
 * The lairs a road passes within reach of (on land), in the order they're
 * passed. The lair at either end of the road (one you're marching on) doesn't
 * ambush you on the way there.
 */
export function lairsOnRoute(r: MarchRoute, lairs: Lair[], units: Army | null): Exposure[] {
  const stops = routeTimeline(r, units);
  const first = r.path[0];
  const last = r.path[r.path.length - 1];
  const out: Exposure[] = [];

  for (const lair of lairs) {
    if (distance(lair, first) < 0.5 || distance(lair, last) < 0.5) continue;
    let best = Infinity;
    let at = -1;

    r.path.forEach((p, k) => {
      if (r.wet[k]) return; // out at sea, bandits can't reach
      const d = distance(p, lair);

      if (d < best) {
        best = d;
        at = k;
      }
    });
    if (at >= 0 && best <= BANDIT.reach) out.push({ lair, f: stops[at] });
  }

  return out.sort((a, b) => a.f - b.f);
}

// ─── Merchants ───────────────────────────────────────────────────────────────

/** Bandits robbing a merchant's load. */
export type Robbery = Point & {
  level: number;
  /** When the merchants pass the lair. */
  at: number;
  /** Resources taken (of the load). */
  stolen: number;
  /** Already happened (the players were told). */
  done?: boolean;
  /** The lair was cleared before the merchants got there: nothing happened. */
  foiled?: boolean;
};

/**
 * Whether bandits rob a load on this road. Guarded loads are left alone. Only
 * the first lair that strikes robs it.
 */
export function rollRobbery(
  exposed: Exposure[],
  amount: number,
  guarded: boolean,
  trip: { startedAt: number; endsAt: number },
  rand: () => number
): Robbery | null {
  if (guarded) return null;
  for (const { lair, f } of exposed) {
    if (rand() >= BANDIT.merchantChance) continue;

    return {
      x: lair.x,
      y: lair.y,
      level: lair.level,
      at: Math.round(trip.startedAt + (trip.endsAt - trip.startedAt) * f),
      stolen: Math.floor(amount * banditTheft(lair.level)),
    };
  }

  return null;
}

// ─── Armies ──────────────────────────────────────────────────────────────────

/** Bandits ambushing an army on the road. */
export type Ambush = Point & {
  level: number;
  at: number;
  /** The army drove the bandits off (it still lost some troops). */
  won: boolean;
  /** Troops killed in the ambush. */
  lost: Army;
  attack: number;
  strength: number;
  /** The luck of the fight (in `attack` already). */
  luck: number;
  /** Already happened: the troops are gone from the army. */
  done?: boolean;
  /** The lair was cleared before the army got there: nothing happened. */
  foiled?: boolean;
  /** Spoils the bandits took from a beaten army. */
  loot?: Partial<Loot>;
  coins?: number;
};

/** Share of an army an ambush kills: a little when it wins, a lot when it doesn't. */
export function ambushLosses(attack: number, strength: number) {
  if (attack >= strength) return 0.3 * Math.pow(strength / attack, 1.5);

  return Math.min(0.7, 0.3 + 0.4 * (1 - attack / Math.max(1, strength)));
}

/**
 * Whether bandits ambush an army on this road. They leave alone armies far
 * stronger than them; otherwise the first lair that strikes fights it.
 */
export function rollAmbush(
  s: GameState,
  units: Army,
  exposed: Exposure[],
  trip: { startedAt: number; endsAt: number },
  rand: () => number
): Ambush | null {
  for (const { lair, f } of exposed) {
    if (rand() >= BANDIT.armyChance) continue;
    const strength = banditStrength(lair.level);
    const luck = luckFrom(rand());
    const attack = Math.round(attackPower(s, units) * luck);

    if (attack >= strength * BANDIT.shyRatio) continue; // too strong: the bandits keep their heads down
    const share = ambushLosses(attack, strength);
    const lost = emptyArmy();

    for (const u of UNIT_IDS) if (!UNIT_BY_ID[u].transport) lost[u] = Math.floor((units[u] ?? 0) * share);

    return {
      x: lair.x,
      y: lair.y,
      level: lair.level,
      at: Math.round(trip.startedAt + (trip.endsAt - trip.startedAt) * f),
      won: attack >= strength,
      lost,
      attack,
      strength,
      luck,
    };
  }

  return null;
}

/** An army after an ambush: the dead taken out. */
export function afterAmbush(units: Army, a: Ambush): Army {
  const out = { ...units };

  for (const u of UNIT_IDS) out[u] = Math.max(0, (out[u] ?? 0) - (a.lost[u] ?? 0));

  return out;
}

/** Bandits who beat an army take half of the spoils it carries. */
export function spoilsTaken(a: Ambush, loot: Partial<Loot> | null, coins: number) {
  const taken: Partial<Loot> = {};
  const left: Partial<Loot> = {};

  for (const r of RESOURCE_IDS) {
    const n = loot?.[r] ?? 0;

    taken[r] = a.won ? 0 : Math.floor(n / 2);
    left[r] = n - (taken[r] ?? 0);
  }
  const coinsTaken = a.won ? 0 : Math.floor(coins / 2);

  return { taken, left, coinsTaken, coinsLeft: coins - coinsTaken };
}

/** Whether a lair has bandits at `t`, given when it was last cleared. */
export const lairActive = (clearedAt: number | null | undefined, t: number) =>
  clearedAt == null || t < clearedAt || t >= clearedAt + BANDIT.respawnMs;

// ─── Raids on villages ───────────────────────────────────────────────────────

/** The manned lairs close enough to raid a village, nearest first. */
export const raidersNear = (home: Point, lairs: (Lair & { active?: boolean })[]) =>
  lairs
    .filter((l) => l.active !== false && distance(l, home) <= BANDIT_RAID.reach)
    .sort((a, b) => distance(a, home) - distance(b, home));

/**
 * Bandits may gather to raid the village: if it's time to look again, it
 * isn't shielded, and a manned lair is near. With `chance` they do, from the
 * nearest lair, as strong as the village's defense is now give or take
 * (BANDIT_RAID); otherwise it looks again later. Returns the state unchanged
 * when nothing is due.
 */
export function gatherBanditRaid(s0: GameState, lairs: Lair[], now: number, rand: () => number): GameState {
  if (s0.banditRaid || now < (s0.banditNextAt ?? 0) || s0.shieldUntil > now) return s0;
  const s = cloneState(s0);
  const lair = lairs[0];

  if (!lair || rand() >= BANDIT_RAID.chance) {
    s.banditNextAt = now + BANDIT_RAID.retryMs;

    return s;
  }
  const f = BANDIT_RAID.strengthMin + rand() * (BANDIT_RAID.strengthMax - BANDIT_RAID.strengthMin);
  const strength = Math.round(Math.max(banditStrength(lair.level), defensePower(s) * f));

  s.banditRaid = { x: lair.x, y: lair.y, level: lair.level, strength, warnedAt: now, arrivesAt: now + BANDIT_RAID.warnMs };
  s.banditNextAt = s.banditRaid.arrivesAt + BANDIT_RAID.everyMs;

  return s;
}

/**
 * The raid arrives (the state brought up to its time). `manned`: whether the
 * lair still had bandits then; cleared in the meantime, the raid is off.
 * Beaten off, the village loses a few defenders, earns the lair's bounty and
 * battle XP, and the lair is cleared (`cleared` in the result, for the
 * server). Otherwise the bandits carry off a share of what isn't hidden and
 * kill some of the troops at home.
 */
export function resolveBanditRaid(s0: GameState, manned: boolean, rand: () => number): { state: GameState; cleared: boolean } {
  const raid = s0.banditRaid;

  if (!raid) return { state: s0, cleared: false };
  const s = cloneState(s0);
  const stolen = Object.fromEntries(RESOURCE_IDS.map((r) => [r, 0])) as BanditRaidReport["stolen"];
  const base = { at: raid.arrivesAt, x: raid.x, y: raid.y, level: raid.level, strength: raid.strength, stolen };

  delete s.banditRaid;
  if (!manned) {
    s.banditReport = { ...base, outcome: "foiled", defense: 0, defenderLosses: emptyArmy() };

    return { state: s, cleared: false };
  }
  const defense = Math.round(defensePower(s));
  const attack = raid.strength * luckFrom(rand());
  const won = defense >= attack;
  const defenders = { ...s.army };
  const share = won ? 0.3 * Math.pow(attack / Math.max(1, defense), 1.5) : BANDIT_RAID.defenderLoss;
  const lost = emptyArmy();

  for (const u of UNIT_IDS) if (!UNIT_BY_ID[u].transport) lost[u] = Math.floor((s.army[u] ?? 0) * share);
  const xp = battleXp(s, defenders, attack, won, "defense");

  applyBattleXp(s, totalArmy(s), lost, xp);
  for (const u of UNIT_IDS) s.army[u] -= lost[u];

  if (won) {
    const bounty = lairBounty(raid.level);
    const cap = getRates(s).capacity;

    for (const r of RESOURCE_IDS) s.resources[r] = Math.max(s.resources[r], Math.min(cap, s.resources[r] + bounty.resources));
    s.coins += bounty.coins;
    s.banditReport = { ...base, outcome: "won", defense, defenderLosses: lost, bounty, xp };
  } else {
    const hidden = getRates(s).hidden;

    for (const r of RESOURCE_IDS) {
      stolen[r] = Math.floor(Math.max(0, s.resources[r] - hidden) * BANDIT_RAID.steal);
      s.resources[r] -= stolen[r];
    }
    s.banditReport = { ...base, outcome: "lost", defense, defenderLosses: lost, xp };
  }

  return { state: s, cleared: won };
}
