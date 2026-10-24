/**
 * Game balance and static definitions.
 *
 * This file is shared by the server (which is authoritative) and the client
 * (which uses it to project state between syncs and to render costs). Change
 * numbers here and both sides stay in agreement.
 */

export const RESOURCE_IDS = ["iron", "wood", "clay", "crop"] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];

export const RESOURCE_NAMES: Record<ResourceId, string> = {
  iron: "Iron",
  wood: "Wood",
  clay: "Clay",
  crop: "Crop",
};

export const START = {
  resources: 2000,
  coins: 1000,
  population: 100,
};

/** Base passive production of every resource, per hour, with no buildings. */
export const BASE_PRODUCTION_PER_HOUR = 100;
/** Base warehouse capacity per resource. */
export const BASE_WAREHOUSE_CAPACITY = 15000;
/** Coins everyone earns per hour without any buildings. */
export const BASE_COINS_PER_HOUR = 10;
/** Population growth per hour without any buildings. */
export const BASE_POPULATION_GROWTH = 10;

// ─── Daily Mine (tapping) ─────────────────────────────────────────────────────
//
// Mining is a short daily boost, not the main game: stamina refills once a
// day (UTC midnight) and each tap spends a fixed amount of it.

export const MAX_SKILL_LEVEL = 20;

/** Base resource gained per tap at a given "Earn more" level. */
export const tapPowerForLevel = (level: number) =>
  Math.round(30 * Math.pow(1.2, level - 1));

/** Daily stamina at a given "Stamina" level. */
export const energyCapacityForLevel = (level: number) =>
  Math.round(1500 * Math.pow(1.15, level - 1));

/** Stamina spent per normal tap (Frenzy taps are free). */
export const STAMINA_PER_TAP = 10;

/** Coin price to go from `level` to `level + 1` for either skill. */
export const skillUpgradeCost = (level: number) =>
  Math.round(100 * Math.pow(1.8, level - 1));

/** Taps closer together than this keep the combo going. */
export const COMBO_WINDOW_MS = 1200;
/** Every 10 combo adds +0.1, up to ×2. */
export const comboMultiplier = (combo: number) => 1 + Math.min(10, Math.floor(combo / 10)) * 0.1;
export const MAX_COMBO_MULTIPLIER = 2;

/** A weak-spot hit is worth this many normal taps. */
export const CRIT_MULTIPLIER = 3;
/** Anti-cheat: at most this share of taps can be weak-spot hits. */
export const MAX_CRIT_SHARE = 0.4;

/** Frenzy meter fills by 2 per tap and 6 more per weak-spot hit; at 100 Frenzy starts. */
export const FRENZY_METER_MAX = 100;
export const FRENZY_PER_TAP = 2;
export const FRENZY_PER_CRIT = 6;
/** Frenzy: double rewards, no stamina, for this long. */
export const FRENZY_MS = 8000;
/** Server leeway for Frenzy taps that arrive in a late batch. */
export const FRENZY_GRACE_MS = 3000;

// ─── Daily streak ────────────────────────────────────────────────────────────

/** Reward for each day of a 7-day login streak (it restarts after day 7). */
export const STREAK_REWARDS: { coins: number; resources?: number }[] = [
  { coins: 200 },
  { coins: 300 },
  { coins: 400 },
  { coins: 500 },
  { coins: 800 },
  { coins: 1200 },
  { coins: 2000, resources: 1000 },
];

/** Anti-cheat: the most taps a human can plausibly make per second. */
export const MAX_TAPS_PER_SECOND = 20;
/** Anti-cheat: taps allowed in a single burst regardless of elapsed time. */
export const TAP_BURST = 40;

// ─── Buildings ───────────────────────────────────────────────────────────────

export const MAX_BUILDING_LEVEL = 20;

export type BuildingEffect =
  | { kind: "production"; resource: ResourceId; perLevel: number }
  | { kind: "cropBoost"; percentPerLevel: number }
  | { kind: "warehouse"; multiplierPerLevel: number }
  | { kind: "townHall" }
  | { kind: "coins"; perLevel: number }
  | { kind: "population"; perLevel: number }
  | { kind: "tapBoost"; percentPerLevel: number }
  | { kind: "military"; stat: MilitaryStat; perLevel: number };

/** What a military building improves, per level. */
export type MilitaryStat =
  | "unlock" // unlocks unit types (see UNITS[].requires)
  | "trainSpeed" // % faster training
  | "attack" // % more attack
  | "defense" // % more defense
  | "wall" // % defense bonus (rams can break it)
  | "flatDefense" // fixed defense points
  | "protect" // resources hidden from raiders (see hiddenResources)
  | "march" // % faster army return
  | "scout" // reveals exact enemy defense
  | "heal"; // % of lost troops recovered

export type BuildingDef = {
  id: string;
  name: string;
  /** Resource cost (each of the four) for level 0 → 1. */
  baseCost: number;
  /** Seconds for level 0 → 1. */
  baseTime: number;
  effect: BuildingEffect;
  description: string;
};

const def = (
  name: string,
  baseCost: number,
  effect: BuildingEffect,
  description: string,
  baseTime = 10
): BuildingDef => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  baseCost,
  baseTime,
  effect,
  description,
});

export const BUILDINGS: BuildingDef[] = [
  def("Town Hall", 300, { kind: "townHall" }, "Builds 4% faster per level. Extra builder at levels 5, 10 and 15."),
  def("Resource Warehouse", 200, { kind: "warehouse", multiplierPerLevel: 1.3 }, "+30% storage for every resource per level."),
  def("Iron Mine", 150, { kind: "production", resource: "iron", perLevel: 60 }, "+60 iron per hour per level."),
  def("Sawmill", 150, { kind: "production", resource: "wood", perLevel: 60 }, "+60 wood per hour per level."),
  def("Brickyard", 150, { kind: "production", resource: "clay", perLevel: 60 }, "+60 clay per hour per level."),
  def("Windmill", 150, { kind: "production", resource: "crop", perLevel: 60 }, "+60 crop per hour per level."),
  def("Fertilizer Workshop", 250, { kind: "cropBoost", percentPerLevel: 10 }, "+10% crop production per level."),
  def("Treasury", 300, { kind: "coins", perLevel: 40 }, "+40 coins per hour per level."),
  def("Trading Post", 250, { kind: "coins", perLevel: 20 }, "+20 coins per hour per level."),
  def("Academy", 300, { kind: "tapBoost", percentPerLevel: 5 }, "+5% resources per tap per level."),
  def("Embassy", 250, { kind: "population", perLevel: 3 }, "+3 extra population growth per hour per level."),
  def("Barracks", 250, { kind: "military", stat: "unlock", perLevel: 0 }, "Trains Spearmen (level 1) and Archers (level 3)."),
  def("Stable", 300, { kind: "military", stat: "unlock", perLevel: 0 }, "Trains Cavalry (level 1)."),
  def("Siege Workshop", 350, { kind: "military", stat: "unlock", perLevel: 0 }, "Builds Battering Rams (level 1) that break enemy walls."),
  def("Military Command", 400, { kind: "military", stat: "trainSpeed", perLevel: 5 }, "Troops train 5% faster per level."),
  def("Arsenal", 300, { kind: "military", stat: "attack", perLevel: 5 }, "+5% attack for all troops per level."),
  def("Armory", 250, { kind: "military", stat: "defense", perLevel: 5 }, "+5% defense for all troops per level."),
  def("City Gate", 200, { kind: "military", stat: "wall", perLevel: 6 }, "+6% defense per level. Enemy rams can break it."),
  def("Watchtower", 200, { kind: "military", stat: "flatDefense", perLevel: 60 }, "+60 defense points per level, even with no troops home."),
  def("Trapmaker", 200, { kind: "military", stat: "defense", perLevel: 4 }, "+4% defense per level."),
  def("Hideout", 200, { kind: "military", stat: "protect", perLevel: 0 }, "Hides more of each resource from raiders every level."),
  def("Hospital", 250, { kind: "military", stat: "heal", perLevel: 4 }, "Saves 4% of troops lost in battle per level (max 50%)."),
  def("War hall", 350, { kind: "military", stat: "march", perLevel: 5 }, "Armies come home 5% faster per level."),
  def("Exploration Center", 300, { kind: "military", stat: "scout", perLevel: 0 }, "Level 1 reveals enemies' exact defense before you attack."),
];

export type BuildingId = string;

export const BUILDING_BY_ID: Record<BuildingId, BuildingDef> = Object.fromEntries(
  BUILDINGS.map((b) => [b.id, b])
);


/** Every building level adds this much population growth per hour… */
export const GROWTH_PER_BUILDING_LEVEL = 2;
/** …and eats this much crop per hour. */
export const CROP_UPKEEP_PER_BUILDING_LEVEL = 1;

/** Cost of each resource to go from `level` to `level + 1`. */
export const buildingUpgradeCost = (b: BuildingDef, level: number) =>
  Math.round(b.baseCost * Math.pow(1.45, level));

/** Raw seconds to go from `level` to `level + 1`, before Town Hall speedup. */
export const buildingUpgradeBaseSeconds = (b: BuildingDef, level: number) =>
  Math.round(b.baseTime * Math.pow(1.55, level));

export const TOWN_HALL_SPEEDUP_PER_LEVEL = 0.04;

// ─── Quests ──────────────────────────────────────────────────────────────────

export type QuestId = "telegram" | "youtube" | "x";

export type QuestDef = {
  id: QuestId;
  title: string;
  reward: { coins: number; population: number; growth: number };
  /** Seconds between opening the link and being able to claim. */
  waitSeconds: number;
};

export const QUESTS: QuestDef[] = [
  { id: "telegram", title: "Join our Telegram Channel", reward: { coins: 1000, population: 10, growth: 4 }, waitSeconds: 5 },
  { id: "youtube", title: "Subscribe to our YouTube Channel", reward: { coins: 1000, population: 10, growth: 4 }, waitSeconds: 10 },
  { id: "x", title: "Follow our X Account", reward: { coins: 1000, population: 10, growth: 4 }, waitSeconds: 10 },
];

export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q])) as Record<QuestId, QuestDef>;

/** Turns a handle or URL from env into a link for a quest. */
export const questUrl = (id: QuestId, value: string | undefined) => {
  if (!value) return null;
  if (/^https?:\/\//.test(value)) return value;
  const handle = value.replace(/^@/, "");
  if (id === "telegram") return `https://t.me/${handle}`;
  if (id === "youtube") return `https://www.youtube.com/@${handle}`;
  return `https://x.com/${handle}`;
};

// ─── Referrals ───────────────────────────────────────────────────────────────

export const REFERRAL_REWARD = {
  coins: 100,
  premiumCoins: 500,
  /** Population the inviter gains for each friend. */
  population: 100,
};

// ─── War ─────────────────────────────────────────────────────────────────────

export const UNIT_IDS = ["spearman", "archer", "cavalry", "ram"] as const;
export type UnitId = (typeof UNIT_IDS)[number];

export type UnitDef = {
  id: UnitId;
  name: string;
  icon: string;
  attack: number;
  defense: number;
  /** Resources one unit can carry home. */
  carry: number;
  cost: Record<ResourceId, number>;
  /** Seconds to train one unit. */
  time: number;
  /** Crop eaten per hour per unit. */
  upkeep: number;
  requires: { building: string; level: number };
  description: string;
};

export const UNITS: UnitDef[] = [
  {
    id: "spearman", name: "Spearman", icon: "🛡️", attack: 12, defense: 18, carry: 25,
    cost: { iron: 25, wood: 45, clay: 20, crop: 15 }, time: 15, upkeep: 1,
    requires: { building: "barracks", level: 1 },
    description: "Cheap, sturdy defender.",
  },
  {
    id: "archer", name: "Archer", icon: "🏹", attack: 22, defense: 10, carry: 15,
    cost: { iron: 35, wood: 55, clay: 15, crop: 20 }, time: 20, upkeep: 1,
    requires: { building: "barracks", level: 3 },
    description: "Strong attack, weak in defense.",
  },
  {
    id: "cavalry", name: "Cavalry", icon: "🐎", attack: 45, defense: 25, carry: 70,
    cost: { iron: 100, wood: 60, clay: 40, crop: 70 }, time: 45, upkeep: 3,
    requires: { building: "stable", level: 1 },
    description: "Hits hard and carries the most loot.",
  },
  {
    id: "ram", name: "Battering Ram", icon: "🪵", attack: 30, defense: 5, carry: 0,
    cost: { iron: 120, wood: 180, clay: 80, crop: 40 }, time: 90, upkeep: 4,
    requires: { building: "siege-workshop", level: 1 },
    description: "Each ram breaks 2% of the enemy's City Gate bonus.",
  },
];

export const UNIT_BY_ID = Object.fromEntries(UNITS.map((u) => [u.id, u])) as Record<UnitId, UnitDef>;

/** Wall bonus removed per ram (fraction of the bonus). */
export const RAM_WALL_BREAK = 0.02;
/** Most training batches a player can queue. */
export const MAX_TRAIN_BATCHES = 5;
/** Most units in one batch. */
export const MAX_BATCH = 500;

/** Every tribe has some militia even with no troops. */
export const militiaDefense = (population: number) => Math.round(50 + population * 0.1);

/** Resources of each type a Hideout keeps safe from raiders. */
export const hiddenResources = (hideoutLevel: number) => Math.round(500 * Math.pow(1.4, hideoutLevel));

/** Raiders can take at most this share of what isn't hidden. */
export const MAX_LOOT_SHARE = 0.5;

/** Seconds an army is away on a raid before it comes home with loot. */
export const RAID_TRAVEL_SECONDS = 90;
export const CAMP_TRAVEL_SECONDS = 45;

/** New players can't be attacked for this long. */
export const NEW_PLAYER_SHIELD_MS = 72 * 3600 * 1000;
/** After being raided, a tribe can't be raided again for this long. */
export const RAIDED_SHIELD_MS = 2 * 3600 * 1000;

/** Luck swings each battle by up to ±10%. */
export const LUCK = 0.1;

// Barbarian camps (PvE)
export const MAX_CAMP_LEVEL = 30;
export const campDefense = (level: number) => Math.round(80 * Math.pow(1.35, level - 1));
/** Reward for clearing a camp level the first time (each resource + coins). */
export const campFirstReward = (level: number) => ({
  resources: Math.round(400 * Math.pow(1.3, level - 1)),
  coins: 100 * level,
});
/** Cleared camps can be raided again for a smaller haul after this cooldown. */
export const CAMP_REPEAT_COOLDOWN_MS = 60 * 60 * 1000;
export const CAMP_REPEAT_SHARE = 0.3;
