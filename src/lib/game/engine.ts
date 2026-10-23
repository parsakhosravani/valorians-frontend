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
  ENERGY_FULL_REFILL_SECONDS,
  FULL_ENERGY_COOLDOWN_MS,
  FULL_ENERGY_PER_DAY,
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
  skillUpgradeCost,
  tapPowerForLevel,
  UNITS,
  UNIT_IDS,
  UnitId,
  NEW_PLAYER_SHIELD_MS,
  hiddenResources,
} from "./config";

export type Army = Record<UnitId, number>;

export const emptyArmy = (): Army => ({ spearman: 0, archer: 0, cavalry: 0, ram: 0 });

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
};

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
  /** Troops at home. */
  army: Army;
  training: TrainItem[];
  marches: March[];
  /** Can't be raided by other players until this time. */
  shieldUntil: number;
  /** Highest barbarian camp cleared, and when each was last raided. */
  camps: { cleared: number; lastRaid: Record<string, number> };
  war: WarStats;
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
};

export class GameError extends Error {
  constructor(
    message: string,
    public code: string = "bad_request"
  ) {
    super(message);
  }
}

const HOUR = 3600 * 1000;

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
    army: emptyArmy(),
    training: [],
    marches: [],
    shieldUntil: now + NEW_PLAYER_SHIELD_MS,
    camps: { cleared: 0, lastRaid: {} },
    war: { attacksWon: 0, attacksLost: 0, defensesWon: 0, defensesLost: 0, resourcesLooted: 0 },
  };
}

/** Fills in anything missing from an older saved state. */
export function normalizeState(s: GameState): GameState {
  const fresh = createInitialState(s.updatedAt);
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
  };
}

/** Units at home + away on raids. */
export function totalArmy(s: GameState): Army {
  const a = { ...s.army };
  for (const m of s.marches) for (const u of UNIT_IDS) a[u] += m.units[u] ?? 0;
  return a;
}

const level = (s: GameState, id: BuildingId) => s.buildings[id] ?? 0;

export function getRates(s: GameState): Rates {
  let townHall = 0;
  let warehouseMult = 1;
  let cropBoost = 0;
  let coins = BASE_COINS_PER_HOUR;
  let growth = BASE_POPULATION_GROWTH + s.bonusGrowth;
  let tapBoost = 0;
  let totalLevels = 0;
  const mil = { trainSpeed: 0, attack: 0, defense: 0, wall: 0, flatDefense: 0, march: 0, heal: 0 };
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

  production.crop =
    production.crop * (1 + cropBoost) - CROP_UPKEEP_PER_BUILDING_LEVEL * totalLevels - troopUpkeep;
  growth += GROWTH_PER_BUILDING_LEVEL * totalLevels;

  const energyCapacity = energyCapacityForLevel(s.skills.energy);

  return {
    productionPerHour: production,
    capacity: Math.round(BASE_WAREHOUSE_CAPACITY * warehouseMult),
    energyCapacity,
    energyPerSecond: energyCapacity / ENERGY_FULL_REFILL_SECONDS,
    tapPower: Math.round(tapPowerForLevel(s.skills.tap) * (1 + tapBoost)),
    coinsPerHour: coins,
    growthPerHour: growth,
    builders: 1 + Math.floor(townHall / 5),
    buildSpeedMultiplier: Math.max(0.2, 1 - TOWN_HALL_SPEEDUP_PER_LEVEL * townHall),
    troopUpkeep,
    trainSpeedMultiplier: Math.max(0.25, 1 - mil.trainSpeed / 100),
    attackBonus: mil.attack / 100,
    defenseBonus: mil.defense / 100,
    wallBonus: mil.wall / 100,
    flatDefense: mil.flatDefense,
    hidden: hiddenResources(level(s, "hideout")),
    marchMultiplier: Math.max(0.3, 1 - mil.march / 100),
    canScout: level(s, "exploration-center") >= 1,
    healShare: Math.min(0.5, mil.heal / 100),
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

  if (s.fullEnergy.day !== utcDay(now)) {
    s.fullEnergy = { ...s.fullEnergy, day: utcDay(now), used: 0 };
  }
  return s;
}

function returnMarch(s: GameState, m: March) {
  for (const u of UNIT_IDS) s.army[u] += m.units[u] ?? 0;
  const cap = getRates(s).capacity;
  for (const r of RESOURCE_IDS) {
    const add = m.loot[r] ?? 0;
    if (add > 0) s.resources[r] = Math.max(s.resources[r], Math.min(cap, s.resources[r] + add));
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
    quests: Object.fromEntries(Object.entries(s.quests).map(([k, v]) => [k, { ...v }])),
    army: { ...s.army },
    training: s.training.map((t) => ({ ...t })),
    marches: s.marches.map((m) => ({ ...m, units: { ...m.units }, loot: { ...m.loot } })),
    camps: { ...s.camps, lastRaid: { ...s.camps.lastRaid } },
    war: { ...s.war },
  };
}

export const cloneState = structuredCloneState;

// ─── Actions (state must already be advanced to `now`) ───────────────────────

export type TapResult = { state: GameState; accepted: number; gained: number };

/**
 * Applies `taps` taps on `resource`. Taps are trimmed to what energy, storage
 * and (on the server) a human tapping speed allow.
 */
export function applyTaps(
  s0: GameState,
  resource: ResourceId,
  taps: number,
  now: number,
  opts: { rateLimit: boolean } = { rateLimit: true }
): TapResult {
  if (!RESOURCE_IDS.includes(resource)) throw new GameError("Unknown resource");
  const s = structuredCloneState(s0);
  const r = getRates(s);
  let allowed = Math.max(0, Math.floor(taps));

  if (opts.rateLimit) {
    const elapsed = Math.max(0, now - s.lastTapAt) / 1000;
    allowed = Math.min(allowed, Math.floor(elapsed * MAX_TAPS_PER_SECOND) + TAP_BURST);
  }
  allowed = Math.min(allowed, Math.floor(s.energy / r.tapPower));
  const room = Math.max(0, r.capacity - s.resources[resource]);
  allowed = Math.min(allowed, Math.ceil(room / r.tapPower));

  const gained = Math.min(room, allowed * r.tapPower);
  s.resources[resource] += gained;
  s.energy -= allowed * r.tapPower;
  if (allowed > 0) s.lastTapAt = now;
  return { state: s, accepted: allowed, gained };
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

export function fullEnergyStatus(s: GameState, now: number) {
  const usedToday = s.fullEnergy.day === utcDay(now) ? s.fullEnergy.used : 0;
  const remaining = Math.max(0, FULL_ENERGY_PER_DAY - usedToday);
  const readyAt = s.fullEnergy.lastUsedAt + FULL_ENERGY_COOLDOWN_MS;
  return { remaining, readyAt, ready: remaining > 0 && now >= readyAt };
}

export function refillEnergy(s0: GameState, now: number): GameState {
  const s = structuredCloneState(s0);
  const st = fullEnergyStatus(s, now);
  if (st.remaining <= 0) throw new GameError("No full energy left today", "none_left");
  if (!st.ready) throw new GameError("Full energy is cooling down", "cooldown");
  const cap = getRates(s).energyCapacity;
  if (s.energy >= cap) throw new GameError("Energy is already full", "already_full");
  s.energy = cap;
  s.fullEnergy = { day: utcDay(now), used: s.fullEnergy.used + 1, lastUsedAt: now };
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
