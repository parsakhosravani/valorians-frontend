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

// ─── Tapping & energy ────────────────────────────────────────────────────────

export const MAX_SKILL_LEVEL = 20;

/** Resource gained (and energy spent) per tap at a given "Earn more" level. */
export const tapPowerForLevel = (level: number) =>
  Math.round(10 * Math.pow(1.2, level - 1));

export const energyCapacityForLevel = (level: number) =>
  Math.round(15000 * Math.pow(1.15, level - 1));

/** Energy refills completely in this many seconds. */
export const ENERGY_FULL_REFILL_SECONDS = 60 * 60;

/** Coin price to go from `level` to `level + 1` for either skill. */
export const skillUpgradeCost = (level: number) =>
  Math.round(100 * Math.pow(1.8, level - 1));

export const FULL_ENERGY_PER_DAY = 3;
export const FULL_ENERGY_COOLDOWN_MS = 60 * 60 * 1000;

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
  | { kind: "military" };

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
  def("Hospital", 250, { kind: "population", perLevel: 5 }, "+5 extra population growth per hour per level."),
  def("Embassy", 250, { kind: "population", perLevel: 3 }, "+3 extra population growth per hour per level."),
  def("City Gate", 200, { kind: "military" }, "Defends your tribe in the coming war."),
  def("Watchtower", 200, { kind: "military" }, "Spots enemies before they strike."),
  def("Barracks", 250, { kind: "military" }, "Trains infantry for the coming war."),
  def("Stable", 250, { kind: "military" }, "Trains cavalry for the coming war."),
  def("Armory", 250, { kind: "military" }, "Forges armour for your warriors."),
  def("Arsenal", 300, { kind: "military" }, "Stores weapons for your army."),
  def("Siege Workshop", 350, { kind: "military" }, "Builds siege engines."),
  def("Trapmaker", 200, { kind: "military" }, "Lays traps around your tribe."),
  def("Hideout", 200, { kind: "military" }, "Hides your people when enemies attack."),
  def("War hall", 350, { kind: "military" }, "Plans your battles."),
  def("Military Command", 400, { kind: "military" }, "Commands your army."),
  def("Exploration Center", 300, { kind: "military" }, "Scouts the lands around your tribe."),
];

export type BuildingId = string;

export const BUILDING_BY_ID: Record<BuildingId, BuildingDef> = Object.fromEntries(
  BUILDINGS.map((b) => [b.id, b])
);

export const buildingImage = (b: BuildingDef) =>
  `/images/buildings/${encodeURIComponent(b.name)}.webp`;

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
