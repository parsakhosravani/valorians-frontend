/**
 * Pure game engine. No I/O, no Date.now() — every function takes the time it
 * should act at. The server runs these to decide what really happens; the
 * client runs the same functions to animate counters between syncs.
 */
import {
  BASE_COINS_PER_HOUR,
  BASE_POPULATION_GROWTH,
  BASE_PRODUCTION_PER_HOUR,
  BASE_WAREHOUSE_CAPACITY,
  BUILDINGS,
  BUILDING_BY_ID,
  BuildingId,
  CROP_UPKEEP_PER_BUILDING_LEVEL,
  GROWTH_PER_BUILDING_LEVEL,
  MAX_BUILDING_LEVEL,
  MAX_SKILL_LEVEL,
  MAX_TAPS_PER_SECOND,
  QUEST_BY_ID,
  QuestId,
  RESOURCE_IDS,
  ResourceId,
  START,
  TAP_BURST,
  TOWN_HALL_SPEEDUP_PER_LEVEL,
  buildingUpgradeBaseSeconds,
  buildingUpgradeCost,
  energyCapacityForLevel,
  STAMINA_PER_TAP,
  CRIT_MULTIPLIER,
  MAX_CRIT_SHARE,
  MAX_COMBO_MULTIPLIER,
  FRENZY_METER_MAX,
  FRENZY_PER_TAP,
  FRENZY_PER_CRIT,
  FRENZY_MS,
  FRENZY_GRACE_MS,
  STREAK_REWARDS,
  skillUpgradeCost,
  tapPowerForLevel,
  UNITS,
  UNIT_IDS,
  UnitId,
  NEW_PLAYER_SHIELD_MS,
  hiddenResources,
  RANKS,
  RANK_BONUS,
  MAX_TRAIN_BATCHES,
  PLUS,
  SHIELDS,
} from "./config";
import { ClanPerks, NO_PERKS } from "./clan";

export type Army = Record<UnitId, number>;

export const emptyArmy = (): Army => Object.fromEntries(UNIT_IDS.map((u) => [u, 0])) as Army;

/** A batch of troops in training. Units finish one after another. */
export type TrainItem = {
  unit: UnitId;
  count: number;
  /** When the first unit started (later than enqueue time if others were ahead). */
  startsAt: number;
  perUnitMs: number;
  /** Units already moved into the army. */
  done: number;
};

/** An army away on a raid, coming home with what it took. */
export type March = {
  id: string;
  target: string;
  units: Army;
  loot: Record<ResourceId, number>;
  coins: number;
  returnsAt: number;
  /** When the army set off home (so the map can place it along the road). */
  leftAt?: number;
  /** Map tile the army is walking home from (for drawing it on the map). */
  from?: { x: number; y: number };
  /** New orders this expedition already took on the road (see REDIRECT). */
  hops?: number;
};

/** A regiment's battle experience; it sets the regiment's rank. */
export type TroopRecord = { xp: number };

export const emptyTroops = (): Record<UnitId, TroopRecord> =>
  Object.fromEntries(UNIT_IDS.map((u) => [u, { xp: 0 }])) as Record<UnitId, TroopRecord>;

/** Rank index (0 = Recruit) for an amount of XP. */
export const rankForXp = (xp: number) => {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) r = i;
  return r;
};

export const unitRank = (s: GameState, u: UnitId) => rankForXp(s.troops?.[u]?.xp ?? 0);

/** Attack and defense multiplier a troop type gets from its rank. */
export const unitMultiplier = (s: GameState, u: UnitId) =>
  1 + unitRank(s, u) * RANK_BONUS;

export type WarStats = {
  attacksWon: number;
  attacksLost: number;
  defensesWon: number;
  defensesLost: number;
  resourcesLooted: number;
};

export type QueueItem = {
  building: BuildingId;
  toLevel: number;
  startedAt: number;
  endsAt: number;
};

export type QuestProgress = { startedAt?: number; claimedAt?: number };

export type GameState = {
  v: 1;
  /** Time (ms) the numbers below are accurate for. */
  updatedAt: number;
  resources: Record<ResourceId, number>;
  coins: number;
  energy: number;
  population: number;
  skills: { tap: number; energy: number };
  fullEnergy: { day: string; used: number; lastUsedAt: number };
  buildings: Record<BuildingId, number>;
  queue: QueueItem[];
  quests: Partial<Record<QuestId, QuestProgress>>;
  /** Extra population growth per hour earned from quests. */
  bonusGrowth: number;
  /** When taps were last accepted (anti-cheat rate limit). */
  lastTapAt: number;
  /** Frenzy meter (0–100) and when the current Frenzy ends. */
  frenzy: { meter: number; until: number };
  /** Daily login streak: last UTC day claimed and the day number (1–7) it was. */
  streak: { lastDay: string | null; count: number };
  /** Troops at home. */
  army: Army;
  training: TrainItem[];
  marches: March[];
  /** Can't be raided by other players until this time. */
  shieldUntil: number;
  /** Highest barbarian camp cleared, and when each was last raided. */
  camps: { cleared: number; lastRaid: Record<string, number> };
  war: WarStats;
  /** Battle experience (rank) of each troop type. */
  troops: Record<UnitId, TroopRecord>;
  /** Bonuses from the player's clan techs (percent). Set by the server when the clan changes. */
  clanPerks: ClanPerks;
  /**
   * Valorians Plus: active until this time; trialUsed once the free trial was
   * taken; paid once a Stars subscription has been bought (it renews by itself).
   */
  plus: { until: number; trialUsed: boolean; paid: boolean };
  /**
   * Raised shields (bought or Plus): no new one before cooldownUntil, and the
   * last free weekly Plus shield was claimed at plusClaimedAt.
   */
  shield: { cooldownUntil: number; plusClaimedAt: number };
  /** Cards the player owns, by level. War Orders: more new orders per expedition. */
  cards: { orders: number };
};

export type Rates = {
  productionPerHour: Record<ResourceId, number>;
  capacity: number;
  energyCapacity: number;
  energyPerSecond: number;
  tapPower: number;
  coinsPerHour: number;
  growthPerHour: number;
  builders: number;
  buildSpeedMultiplier: number;
  /** Crop eaten per hour by all troops (already subtracted from crop production). */
  troopUpkeep: number;
  trainSpeedMultiplier: number;
  attackBonus: number;
  defenseBonus: number;
  wallBonus: number;
  flatDefense: number;
  hidden: number;
  marchMultiplier: number;
  canScout: boolean;
  healShare: number;
  /** Extra defense against armies landing from the sea (Harbor). */
  seaDefenseBonus: number;
};

export class GameError extends Error {
  constructor(
    message: string,
    public code: string = "bad_request"
  ) {
    super(message);
  }
}

export const HOUR = 3600 * 1000;

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function createInitialState(now: number): GameState {
  return {
    v: 1,
    updatedAt: now,
    resources: { iron: START.resources, wood: START.resources, clay: START.resources, crop: START.resources },
    coins: START.coins,
    energy: energyCapacityForLevel(1),
    population: START.population,
    skills: { tap: 1, energy: 1 },
    fullEnergy: { day: utcDay(now), used: 0, lastUsedAt: 0 },
    buildings: Object.fromEntries(BUILDINGS.map((b) => [b.id, 0])),
    queue: [],
    quests: {},
    bonusGrowth: 0,
    lastTapAt: now,
    frenzy: { meter: 0, until: 0 },
    streak: { lastDay: null, count: 0 },
    army: emptyArmy(),
    training: [],
    marches: [],
    shieldUntil: now + NEW_PLAYER_SHIELD_MS,
    camps: { cleared: 0, lastRaid: {} },
    war: { attacksWon: 0, attacksLost: 0, defensesWon: 0, defensesLost: 0, resourcesLooted: 0 },
    troops: emptyTroops(),
    clanPerks: { ...NO_PERKS },
    plus: { until: 0, trialUsed: false, paid: false },
    shield: { cooldownUntil: 0, plusClaimedAt: 0 },
    cards: { orders: 0 },
  };
}

/** Fills in anything missing from an older saved state. */
export function normalizeState(saved: GameState): GameState {
  const fresh = createInitialState(saved.updatedAt);
  // Arsenal troop upgrades were removed; drop any upgrade left in old saves.
  const { forge: _forge, ...s } = saved as GameState & { forge?: unknown };
  return {
    ...fresh,
    ...s,
    resources: { ...fresh.resources, ...s.resources },
    skills: { ...fresh.skills, ...s.skills },
    fullEnergy: { ...fresh.fullEnergy, ...s.fullEnergy },
    buildings: { ...fresh.buildings, ...s.buildings },
    queue: s.queue ?? [],
    quests: s.quests ?? {},
    army: { ...fresh.army, ...s.army },
    training: s.training ?? [],
    marches: s.marches ?? [],
    // Players who existed before war was added don't get a new-player shield.
    shieldUntil: s.shieldUntil ?? 0,
    camps: { ...fresh.camps, ...s.camps, lastRaid: { ...(s.camps?.lastRaid ?? {}) } },
    war: { ...fresh.war, ...s.war },
    frenzy: { ...fresh.frenzy, ...s.frenzy },
    streak: { ...fresh.streak, ...s.streak },
    clanPerks: { ...fresh.clanPerks, ...s.clanPerks },
    plus: { ...fresh.plus, ...s.plus },
    shield: { ...fresh.shield, ...s.shield },
    cards: { ...fresh.cards, ...s.cards },
    troops: Object.fromEntries(
      UNIT_IDS.map((u) => [u, { xp: s.troops?.[u]?.xp ?? 0 }])
    ) as Record<UnitId, TroopRecord>,
  };
}

/** Units at home + away on raids. */
export function totalArmy(s: GameState): Army {
  const a = { ...s.army };
  for (const m of s.marches) for (const u of UNIT_IDS) a[u] += m.units[u] ?? 0;
  return a;
}

const level = (s: GameState, id: BuildingId) => s.buildings[id] ?? 0;

// ─── Valorians Plus ──────────────────────────────────────────────────────────

/** True while the player's Plus subscription (or trial) runs, at the state's own time. */
export const plusActive = (s: GameState) => (s.plus?.until ?? 0) > s.updatedAt;

/** How many training batches the player may queue. */
export const maxTrainBatches = (s: GameState) => MAX_TRAIN_BATCHES + (plusActive(s) ? PLUS.extraTrainBatches : 0);

/** Starts the one free Plus trial. */
export function startPlusTrial(s0: GameState, now: number): GameState {
  if (s0.plus.trialUsed) throw new GameError("You already used your free trial", "trial_used");
  if (s0.plus.until > now) throw new GameError("Plus is already active", "plus_active");
  const s = cloneState(s0);

  s.plus = { until: now + PLUS.trialMs, trialUsed: true, paid: false };

  return s;
}

/**
 * Applies a paid period: Plus runs until `until` (Telegram's renewal date), or
 * for one more period from whatever is left when that isn't known. Never shortens it.
 */
export function grantPlus(s0: GameState, now: number, until?: number): GameState {
  const s = cloneState(s0);
  const end = until && until > now ? Math.max(until, s.plus.until) : Math.max(now, s.plus.until) + PLUS.periodMs;

  s.plus = { until: end, trialUsed: true, paid: true };

  return s;
}

// ─── Shields ─────────────────────────────────────────────────────────────────

/**
 * Raises a shield for `hours` from now. Refused while the last raised shield
 * is still cooling down, or when the tribe is already shielded for longer.
 */
export function raiseShield(s0: GameState, hours: number, now: number): GameState {
  if (s0.shield.cooldownUntil > now) {
    throw new GameError(`Your shield is recharging. Next one in ${Math.ceil((s0.shield.cooldownUntil - now) / 3600e3)}h`, "shield_cooldown");
  }
  const end = now + hours * HOUR;

  if (s0.shieldUntil >= end) throw new GameError("You're already shielded for longer than that", "already_shielded");
  const s = cloneState(s0);

  s.shieldUntil = end;
  s.shield.cooldownUntil = end + SHIELDS.cooldownMs;

  return s;
}

/** Why a shield of `hours` can't be raised now, or null if it can. */
export function shieldBlocked(s: GameState, hours: number, now: number): string | null {
  try {
    raiseShield(s, hours, now);

    return null;
  } catch (e) {
    return e instanceof GameError ? e.message : "Shields are unavailable right now";
  }
}

/** When the next free weekly Plus shield can be claimed. */
export const plusShieldReadyAt = (s: GameState) => (s.shield.plusClaimedAt ? s.shield.plusClaimedAt + PLUS.weeklyShieldEveryMs : 0);

/** Plus players raise one free shield a week. */
export function claimPlusShield(s0: GameState, now: number): GameState {
  if (!plusActive(s0)) throw new GameError("The weekly shield comes with Valorians Plus", "plus_required");
  if (plusShieldReadyAt(s0) > now) {
    throw new GameError(`Your weekly shield is back in ${Math.ceil((plusShieldReadyAt(s0) - now) / 86400e3)}d`, "plus_shield_used");
  }
  const s = raiseShield(s0, PLUS.weeklyShieldHours, now);

  s.shield.plusClaimedAt = now;

  return s;
}

/** Drops a shield early (attacking, or a refunded purchase); its cooldown starts now. */
export function breakShield(s: GameState, now: number) {
  if (s.shieldUntil <= now) return;
  s.shieldUntil = now;
  if (s.shield.cooldownUntil > now) s.shield.cooldownUntil = now + SHIELDS.cooldownMs;
}

export function getRates(s: GameState): Rates {
  let townHall = 0;
  let warehouseMult = 1;
  let cropBoost = 0;
  let coins = BASE_COINS_PER_HOUR;
  let growth = BASE_POPULATION_GROWTH + s.bonusGrowth;
  let tapBoost = 0;
  let totalLevels = 0;
  const mil = { trainSpeed: 0, attack: 0, defense: 0, wall: 0, flatDefense: 0, march: 0, heal: 0, seaDefense: 0 };
  const production: Record<ResourceId, number> = {
    iron: BASE_PRODUCTION_PER_HOUR,
    wood: BASE_PRODUCTION_PER_HOUR,
    clay: BASE_PRODUCTION_PER_HOUR,
    crop: BASE_PRODUCTION_PER_HOUR,
  };

  for (const b of BUILDINGS) {
    const l = level(s, b.id);
    if (!l) continue;
    totalLevels += l;
    const e = b.effect;
    switch (e.kind) {
      case "production":
        production[e.resource] += e.perLevel * l;
        break;
      case "cropBoost":
        cropBoost += (e.percentPerLevel * l) / 100;
        break;
      case "warehouse":
        warehouseMult *= Math.pow(e.multiplierPerLevel, l);
        break;
      case "townHall":
        townHall = l;
        break;
      case "coins":
        coins += e.perLevel * l;
        break;
      case "population":
        growth += e.perLevel * l;
        break;
      case "tapBoost":
        tapBoost += (e.percentPerLevel * l) / 100;
        break;
      case "military":
        if (e.stat in mil) mil[e.stat as keyof typeof mil] += e.perLevel * l;
        break;
    }
  }

  const army = totalArmy(s);
  const troopUpkeep = UNITS.reduce((sum, u) => sum + u.upkeep * army[u.id], 0);

  const perks = s.clanPerks ?? NO_PERKS;
  const clanProduction = 1 + perks.production / 100;

  for (const id of RESOURCE_IDS) if (id !== "crop") production[id] *= clanProduction;
  production.crop =
    production.crop * (1 + cropBoost) * clanProduction - CROP_UPKEEP_PER_BUILDING_LEVEL * totalLevels - troopUpkeep;
  growth += GROWTH_PER_BUILDING_LEVEL * totalLevels;

  const energyCapacity = energyCapacityForLevel(s.skills.energy);

  return {
    productionPerHour: production,
    capacity: Math.round(BASE_WAREHOUSE_CAPACITY * warehouseMult),
    energyCapacity,
    energyPerSecond: 0, // stamina refills once a day, see advance()
    tapPower: Math.round(tapPowerForLevel(s.skills.tap) * (1 + tapBoost)),
    coinsPerHour: coins,
    growthPerHour: growth,
    builders: 1 + Math.floor(townHall / 5) + (plusActive(s) ? PLUS.extraBuilders : 0),
    buildSpeedMultiplier: Math.max(0.2, 1 - TOWN_HALL_SPEEDUP_PER_LEVEL * townHall),
    troopUpkeep,
    trainSpeedMultiplier: Math.max(0.25, 1 - mil.trainSpeed / 100),
    attackBonus: (mil.attack + perks.attack) / 100,
    defenseBonus: (mil.defense + perks.defense) / 100,
    wallBonus: mil.wall / 100,
    flatDefense: mil.flatDefense,
    hidden: hiddenResources(level(s, "hideout")),
    marchMultiplier: Math.max(0.3, 1 - mil.march / 100),
    canScout: level(s, "exploration-center") >= 1,
    healShare: Math.min(0.5, mil.heal / 100),
    seaDefenseBonus: mil.seaDefense / 100,
  };
}

/** Lets time pass with constant rates (no building finishes in between). */
function flow(s: GameState, to: number) {
  const dtMs = to - s.updatedAt;
  if (dtMs <= 0) return;
  const r = getRates(s);
  const hours = dtMs / HOUR;

  for (const id of RESOURCE_IDS) {
    const cur = s.resources[id];
    const delta = r.productionPerHour[id] * hours;
    if (delta >= 0) {
      // Production fills up to capacity; it never pushes past it, but it
      // also never destroys stock that is already above it.
      s.resources[id] = cur >= r.capacity ? cur : Math.min(r.capacity, cur + delta);
    } else {
      s.resources[id] = Math.max(0, cur + delta);
    }
  }
  s.coins += r.coinsPerHour * hours;
  s.population += r.growthPerHour * hours;
  s.energy = Math.min(r.energyCapacity, s.energy + (r.energyPerSecond * dtMs) / 1000);
  s.updatedAt = to;
}

/**
 * Moves the state forward to `now`, finishing building upgrades exactly when
 * they complete so later production uses the new levels.
 */
export function advance(state: GameState, now: number): GameState {
  const s = structuredCloneState(state);
  if (now <= s.updatedAt) return s;

  // Buildings finishing and armies returning change rates, so handle them in
  // time order and let production flow between them.
  type Ev = { at: number; run: () => void };
  const events: Ev[] = [];
  for (const item of s.queue) {
    if (item.endsAt <= now) {
      events.push({
        at: item.endsAt,
        run: () => (s.buildings[item.building] = Math.max(level(s, item.building), item.toLevel)),
      });
    }
  }
  for (const m of s.marches) {
    if (m.returnsAt <= now) events.push({ at: m.returnsAt, run: () => returnMarch(s, m) });
  }
  events.sort((a, b) => a.at - b.at);
  for (const ev of events) {
    flow(s, Math.max(s.updatedAt, ev.at));
    ev.run();
  }
  s.queue = s.queue.filter((q) => q.endsAt > now);
  s.marches = s.marches.filter((m) => m.returnsAt > now);
  flow(s, now);
  finishTraining(s, now);

  const cap = getRates(s).energyCapacity;
  if (s.fullEnergy.day !== utcDay(now)) {
    // A new day: stamina refills completely.
    s.fullEnergy = { ...s.fullEnergy, day: utcDay(now), used: 0 };
    s.energy = cap;
  }
  s.energy = Math.min(s.energy, cap);
  return s;
}

function returnMarch(s: GameState, m: March) {
  for (const u of UNIT_IDS) s.army[u] += m.units[u] ?? 0;
  // Loot always lands, even past the warehouse's capacity: the report already
  // promised it, and capping here silently threw the rest away. Over capacity,
  // production just waits until it's spent back down (see flow).
  for (const r of RESOURCE_IDS) {
    const add = m.loot[r] ?? 0;
    if (add > 0) s.resources[r] += add;
  }
  s.coins += m.coins;
}

/** Moves every unit whose training has finished into the army. */
function finishTraining(s: GameState, now: number) {
  for (const t of s.training) {
    const finished = Math.min(t.count, Math.max(0, Math.floor((now - t.startsAt) / t.perUnitMs)));
    if (finished > t.done) {
      s.army[t.unit] += finished - t.done;
      t.done = finished;
    }
  }
  s.training = s.training.filter((t) => t.done < t.count);
}

export const trainingEndsAt = (t: TrainItem) => t.startsAt + t.count * t.perUnitMs;

function structuredCloneState(s: GameState): GameState {
  return {
    ...s,
    resources: { ...s.resources },
    skills: { ...s.skills },
    fullEnergy: { ...s.fullEnergy },
    buildings: { ...s.buildings },
    queue: s.queue.map((q) => ({ ...q })),
    plus: { ...s.plus },
    shield: { ...s.shield },
    cards: { orders: s.cards?.orders ?? 0 },
    quests: Object.fromEntries(Object.entries(s.quests).map(([k, v]) => [k, { ...v }])),
    army: { ...s.army },
    training: s.training.map((t) => ({ ...t })),
    marches: s.marches.map((m) => ({ ...m, units: { ...m.units }, loot: { ...m.loot }, ...(m.from ? { from: { ...m.from } } : {}) })),
    camps: { ...s.camps, lastRaid: { ...s.camps.lastRaid } },
    war: { ...s.war },
    frenzy: { ...s.frenzy },
    streak: { ...s.streak },
    troops: Object.fromEntries(
      UNIT_IDS.map((u) => [u, { xp: s.troops?.[u]?.xp ?? 0 }])
    ) as Record<UnitId, TroopRecord>,
  };
}

export const cloneState = structuredCloneState;

// ─── Actions (state must already be advanced to `now`) ───────────────────────

export type TapResult = { state: GameState; accepted: number; gained: number };

/** What the client reports for a burst of taps on one resource. */
export type TapBatch = {
  taps: number;
  /** How many of those hit the weak spot. */
  crits?: number;
  /** Sum of the combo multiplier at each tap (taps × average multiplier). */
  comboSum?: number;
  /** How many taps happened during Frenzy. */
  frenzyTaps?: number;
};

export const frenzyActive = (s: GameState, now: number) => now < s.frenzy.until;

/**
 * Applies a batch of taps. The server can't see each tap, so it caps
 * everything the client claims: tap speed, weak-spot share, combo multiplier,
 * and Frenzy (which only counts once the meter really filled). Stamina,
 * storage space and the daily limit do the rest.
 */
export function applyTaps(
  s0: GameState,
  resource: ResourceId,
  batch: TapBatch | number,
  now: number,
  opts: { rateLimit: boolean } = { rateLimit: true }
): TapResult {
  if (!RESOURCE_IDS.includes(resource)) throw new GameError("Unknown resource");
  const b: TapBatch = typeof batch === "number" ? { taps: batch } : batch;
  const s = structuredCloneState(s0);
  const r = getRates(s);
  const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

  let taps = n(b.taps);
  if (opts.rateLimit) {
    const elapsed = Math.max(0, now - s.lastTapAt) / 1000;
    taps = Math.min(taps, Math.floor(elapsed * MAX_TAPS_PER_SECOND) + TAP_BURST);
  }
  let crits = Math.min(n(b.crits), Math.ceil(taps * MAX_CRIT_SHARE));
  let frenzyTaps = Math.min(n(b.frenzyTaps), taps);

  // Frenzy taps only count if Frenzy is (or just was) running, or if this
  // batch's normal taps fill the meter.
  const meterAfter = s.frenzy.meter + (taps - frenzyTaps) * FRENZY_PER_TAP + crits * FRENZY_PER_CRIT;
  const inFrenzy = now <= s.frenzy.until + FRENZY_GRACE_MS;
  if (frenzyTaps > 0 && !inFrenzy && meterAfter < FRENZY_METER_MAX) frenzyTaps = 0;

  let normal = taps - frenzyTaps;
  normal = Math.min(normal, Math.floor(s.energy / STAMINA_PER_TAP));
  const room = Math.max(0, r.capacity - s.resources[resource]);
  // Don't burn stamina on taps the warehouse has no room for.
  normal = Math.min(normal, Math.ceil(room / r.tapPower));
  frenzyTaps = Math.min(frenzyTaps, Math.ceil(room / r.tapPower));
  taps = normal + frenzyTaps;
  crits = Math.min(crits, taps);

  const comboAvg = taps ? Math.min(MAX_COMBO_MULTIPLIER, Math.max(1, (Number(b.comboSum) || taps) / taps)) : 1;
  const units = normal + frenzyTaps * 2 + crits * (CRIT_MULTIPLIER - 1);
  const gained = Math.min(room, Math.round(r.tapPower * comboAvg * units));

  s.resources[resource] += gained;
  s.energy -= normal * STAMINA_PER_TAP;
  if (taps > 0) s.lastTapAt = now;

  // Meter: Frenzy taps don't fill it.
  if (!frenzyActive(s, now)) {
    s.frenzy.meter += normal * FRENZY_PER_TAP + Math.min(crits, normal) * FRENZY_PER_CRIT;
    if (s.frenzy.meter >= FRENZY_METER_MAX) {
      s.frenzy = { meter: 0, until: now + FRENZY_MS };
    }
  }
  return { state: s, accepted: taps, gained };
}

// ─── Daily streak ────────────────────────────────────────────────────────────

export function streakStatus(s: GameState, now: number) {
  const today = utcDay(now);
  const yesterday = utcDay(now - 86_400_000);
  const claimedToday = s.streak.lastDay === today;
  const continues = s.streak.lastDay === yesterday || claimedToday;
  const current = continues ? s.streak.count : 0;
  // Day number the next claim gives (1–7).
  const next = claimedToday ? (current % 7) + 1 : continues ? (current % 7) + 1 : 1;
  return { claimable: !claimedToday, current, next, today: claimedToday ? current : next };
}

export function claimStreak(s0: GameState, now: number): GameState {
  const st = streakStatus(s0, now);
  if (!st.claimable) throw new GameError("Come back tomorrow for your next reward", "claimed");
  const s = structuredCloneState(s0);
  const reward = STREAK_REWARDS[st.next - 1];
  s.coins += reward.coins;
  if (reward.resources) {
    const cap = getRates(s).capacity;
    for (const res of RESOURCE_IDS) s.resources[res] = Math.max(s.resources[res], Math.min(cap, s.resources[res] + reward.resources));
  }
  s.streak = { lastDay: utcDay(now), count: st.next };
  return s;
}

export type SkillId = "tap" | "energy";

export function upgradeSkill(s0: GameState, skill: SkillId): GameState {
  if (skill !== "tap" && skill !== "energy") throw new GameError("Unknown skill");
  const s = structuredCloneState(s0);
  const lvl = s.skills[skill];
  if (lvl >= MAX_SKILL_LEVEL) throw new GameError("Already at max level", "max_level");
  const cost = skillUpgradeCost(lvl);
  if (s.coins < cost) throw new GameError("Not enough coins", "not_enough_coins");
  s.coins -= cost;
  s.skills[skill] = lvl + 1;
  return s;
}

/** The level a building will have once everything queued for it finishes. */
export const targetLevel = (s: GameState, id: BuildingId) =>
  Math.max(level(s, id), ...s.queue.filter((q) => q.building === id).map((q) => q.toLevel));

export function buildingUpgradeInfo(s: GameState, id: BuildingId) {
  const b = BUILDING_BY_ID[id];
  if (!b) throw new GameError("Unknown building");
  const from = targetLevel(s, id);
  const r = getRates(s);
  return {
    from,
    cost: buildingUpgradeCost(b, from),
    seconds: Math.max(1, Math.round(buildingUpgradeBaseSeconds(b, from) * r.buildSpeedMultiplier)),
    maxed: from >= MAX_BUILDING_LEVEL,
  };
}

export function upgradeBuilding(s0: GameState, id: BuildingId, now: number): GameState {
  const s = structuredCloneState(s0);
  const info = buildingUpgradeInfo(s, id);
  if (info.maxed) throw new GameError("Already at max level", "max_level");
  if (s.queue.some((q) => q.building === id)) throw new GameError("This building is already being upgraded", "busy");
  if (s.queue.length >= getRates(s).builders) throw new GameError("All builders are busy", "no_builder");
  for (const res of RESOURCE_IDS) {
    if (s.resources[res] < info.cost) throw new GameError(`Not enough ${res}`, "not_enough_resources");
  }
  for (const res of RESOURCE_IDS) s.resources[res] -= info.cost;
  s.queue.push({ building: id, toLevel: info.from + 1, startedAt: now, endsAt: now + info.seconds * 1000 });
  return s;
}

export function startQuest(s0: GameState, id: QuestId, now: number): GameState {
  if (!QUEST_BY_ID[id]) throw new GameError("Unknown quest");
  const s = structuredCloneState(s0);
  const q = s.quests[id] ?? {};
  if (q.claimedAt) return s;
  if (!q.startedAt) s.quests[id] = { ...q, startedAt: now };
  return s;
}

export function questStatus(s: GameState, id: QuestId, now: number) {
  const def = QUEST_BY_ID[id];
  const q = s.quests[id] ?? {};
  if (q.claimedAt) return { state: "claimed" as const, readyAt: 0 };
  if (!q.startedAt) return { state: "new" as const, readyAt: 0 };
  const readyAt = q.startedAt + def.waitSeconds * 1000;
  return { state: now >= readyAt ? ("ready" as const) : ("waiting" as const), readyAt };
}

export function claimQuest(s0: GameState, id: QuestId, now: number): GameState {
  const st = questStatus(s0, id, now);
  if (st.state === "claimed") throw new GameError("Reward already claimed", "claimed");
  if (st.state === "new") throw new GameError("Open the task first", "not_started");
  if (st.state === "waiting") throw new GameError("Finish the task first, then claim", "too_early");
  const s = structuredCloneState(s0);
  const r = QUEST_BY_ID[id].reward;
  s.coins += r.coins;
  s.population += r.population;
  s.bonusGrowth += r.growth;
  s.quests[id] = { ...s.quests[id], claimedAt: now };
  return s;
}
