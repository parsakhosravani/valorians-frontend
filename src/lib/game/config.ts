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

// Buildings have no top level: each upgrade costs more and takes longer
// than the last (see buildingUpgradeCost, buildingUpgradeBaseSeconds).

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
  | "heal" // % of lost troops recovered
  | "seaDefense"; // % more defense against armies landing from the sea

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
  def("Trading Post", 250, { kind: "coins", perLevel: 20 }, "+20 coins per hour. Each level adds a Market merchant: one more offer, +1,000 per load."),
  def("Academy", 300, { kind: "tapBoost", percentPerLevel: 5 }, "+5% resources per tap per level."),
  def("Embassy", 250, { kind: "population", perLevel: 3 }, "+3 extra population growth per hour per level."),
  def("Barracks", 250, { kind: "military", stat: "unlock", perLevel: 0 }, "Trains Spearmen (level 1), Swordsmen (2), Archers (3) and Axemen (5)."),
  def("Stable", 300, { kind: "military", stat: "unlock", perLevel: 0 }, "Trains Light Cavalry (level 1), Paladins (3) and Knights (10)."),
  def("Siege Workshop", 350, { kind: "military", stat: "unlock", perLevel: 0 }, "Builds Battering Rams (level 1) that break walls and Catapults (level 5) that break towers."),
  def("Military Command", 400, { kind: "military", stat: "trainSpeed", perLevel: 5 }, "Troops train 5% faster per level."),
  def("Arsenal", 300, { kind: "military", stat: "attack", perLevel: 5 }, "+5% attack for all troops per level."),
  def("Armory", 250, { kind: "military", stat: "defense", perLevel: 5 }, "+5% defense for all troops per level."),
  def("City Gate", 200, { kind: "military", stat: "wall", perLevel: 6 }, "+6% defense per level. Enemy rams can break it."),
  def("Watchtower", 200, { kind: "military", stat: "flatDefense", perLevel: 60 }, "+60 defense points per level, even with no troops home."),
  def("Trapmaker", 200, { kind: "military", stat: "defense", perLevel: 4 }, "+4% defense per level."),
  def("Hideout", 200, { kind: "military", stat: "protect", perLevel: 0 }, "Hides more of each resource from raiders every level."),
  def("Hospital", 250, { kind: "military", stat: "heal", perLevel: 4 }, "Treats the wounded after a battle: saves 4% of them per level (max 50%). The killed can't be saved."),
  def("War hall", 350, { kind: "military", stat: "march", perLevel: 5 }, "Armies come home 5% faster per level."),
  def("Exploration Center", 300, { kind: "military", stat: "scout", perLevel: 0 }, "Level 1 reveals enemies' exact defense before you attack."),
  def("Harbor", 300, { kind: "military", stat: "seaDefense", perLevel: 4 }, "Builds Longships (level 1) to carry armies across the sea. +4% defense against landings from the sea per level."),
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

// ─── Clans ───────────────────────────────────────────────────────────────────

export const CLAN = {
  /** Coins it costs to found a clan. */
  createCost: 500,
  maxMembers: 30,
  nameMin: 3,
  nameMax: 24,
  /** Tag shown next to member names, e.g. [WOLF]. Letters and digits only. */
  tagMin: 2,
  tagMax: 5,
  descriptionMax: 160,
  /** Most officers (Huscarls) a clan can name besides its leader. */
  maxOfficers: 4,
  /** Pending join requests one player can have out at once. */
  maxRequests: 3,
  /** Each Great Hall level adds this many member seats (on top of maxMembers). */
  seatsPerHallLevel: 5,
  /** Perk per tech level, in percent. */
  fieldsPercent: 3,
  bannersPercent: 2,
  shieldwallPercent: 2,
  /** Tech cost for level 0 → 1 (each resource, and coins); each level costs techCostGrowth× more. */
  techBaseResources: 4000,
  techBaseCoins: 500,
  techCostGrowth: 2.2,
  /** A donated coin counts this much towards a member's contribution. */
  coinContributionWeight: 4,
  /** Entries kept in the clan chronicle shown to members. */
  logSize: 40,
};

// ─── Valorians Plus ──────────────────────────────────────────────────────────

/**
 * The monthly Plus subscription, paid in Telegram Stars. It sells convenience,
 * never raw power: more queue room and a badge, no troops, resources or stats.
 */
export const PLUS = {
  /** Default monthly price in Stars (the server's PLUS_PRICE_STARS overrides it). */
  priceStars: 150,
  /** Telegram Stars subscriptions always renew every 30 days. */
  periodMs: 30 * 24 * 3600e3,
  /** One free trial per player. */
  trialMs: 3 * 24 * 3600e3,
  /** Extra builders while Plus is active. */
  extraBuilders: 1,
  /** Extra training batches while Plus is active. */
  extraTrainBatches: 2,
  /** Plus players can raise one free shield of this many hours each week. */
  weeklyShieldHours: 8,
  weeklyShieldEveryMs: 7 * 24 * 3600e3,
};

// ─── Shields for sale ────────────────────────────────────────────────────────

/**
 * Shields bought with Telegram Stars. They protect a tribe that is away, but
 * they can't turn into a fortress: attacking anyone breaks your shield, the
 * longest one is 3 days, and after one ends another can't be raised for a day.
 */
export const SHIELDS = {
  options: [
    { id: "8h", hours: 8, stars: 25 },
    { id: "24h", hours: 24, stars: 60 },
    { id: "3d", hours: 72, stars: 150 },
  ],
  /** After a raised shield ends (or breaks), the next one has to wait this long. */
  cooldownMs: 24 * 3600e3,
} as const;

export type ShieldId = (typeof SHIELDS.options)[number]["id"];
export const shieldOption = (id: unknown) => SHIELDS.options.find((o) => o.id === id) ?? null;

// ─── War ─────────────────────────────────────────────────────────────────────

export const UNIT_IDS = ["spearman", "swordsman", "archer", "axeman", "cavalry", "paladin", "knight", "ram", "catapult", "longship"] as const;
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
  /** Seconds to cross one map tile. An army moves at its slowest unit. */
  speed: number;
  requires: { building: string; level: number };
  description: string;
  /** Mounted: weaker in forests, and anti-cavalry troops defend better against it. */
  mounted?: boolean;
  /** Defends better against the mounted share of an attack (see ANTI_CAVALRY_BONUS). */
  antiCavalry?: boolean;
  /** Share of the enemy's City Gate bonus each one breaks. */
  wallBreak?: number;
  /** Share of the enemy's Watchtower defense each one breaks. */
  towerBreak?: number;
  /**
   * A ship: carries this many troop slots across the sea (see unitSlots). Ships
   * never fight; they wait off the beach and sail the survivors home. For
   * ships `speed` is the sailing speed.
   */
  transport?: number;
};

export const UNITS: UnitDef[] = [
  {
    id: "spearman", name: "Spearman", icon: "🔱", attack: 12, defense: 18, carry: 25,
    cost: { iron: 25, wood: 45, clay: 20, crop: 15 }, time: 15, upkeep: 1, speed: 30,
    requires: { building: "barracks", level: 1 },
    description: "Cheap, sturdy defender. Strong against cavalry.",
    antiCavalry: true,
  },
  {
    id: "swordsman", name: "Swordsman", icon: "🗡️", attack: 30, defense: 22, carry: 40,
    cost: { iron: 70, wood: 40, clay: 45, crop: 25 }, time: 25, upkeep: 1, speed: 30,
    requires: { building: "barracks", level: 2 },
    description: "Well-armored all-rounder. Good in attack and defense.",
  },
  {
    id: "archer", name: "Archer", icon: "🏹", attack: 22, defense: 10, carry: 15,
    cost: { iron: 35, wood: 55, clay: 15, crop: 20 }, time: 20, upkeep: 1, speed: 27,
    requires: { building: "barracks", level: 3 },
    description: "Strong attack, weak in defense.",
  },
  {
    id: "axeman", name: "Axeman", icon: "🪓", attack: 45, defense: 12, carry: 45,
    cost: { iron: 85, wood: 60, clay: 30, crop: 35 }, time: 35, upkeep: 1, speed: 30,
    requires: { building: "barracks", level: 5 },
    description: "The strongest foot soldier in attack, but weak in defense.",
  },
  {
    id: "cavalry", name: "Light Cavalry", icon: "🐎", attack: 45, defense: 25, carry: 70,
    cost: { iron: 100, wood: 60, clay: 40, crop: 70 }, time: 45, upkeep: 3, speed: 12,
    requires: { building: "stable", level: 1 },
    description: "Fast attack horsemen. Carry the most loot, but weak in forests and against spears.",
    mounted: true,
  },
  {
    id: "paladin", name: "Paladin", icon: "🐴", attack: 30, defense: 55, carry: 60,
    cost: { iron: 140, wood: 100, clay: 100, crop: 70 }, time: 60, upkeep: 2, speed: 15,
    requires: { building: "stable", level: 3 },
    description: "Defensive horseman. The best defender, and rides fast to help.",
    mounted: true,
  },
  {
    id: "knight", name: "Knight", icon: "🛡️🗡️", attack: 75, defense: 40, carry: 80,
    cost: { iron: 220, wood: 160, clay: 150, crop: 90 }, time: 90, upkeep: 4, speed: 14,
    requires: { building: "stable", level: 10 },
    description: "Heavy armored knight. The strongest attacker in the game.",
    mounted: true,
  },
  {
    id: "ram", name: "Battering Ram", icon: "🪵", attack: 30, defense: 5, carry: 0,
    cost: { iron: 120, wood: 180, clay: 80, crop: 40 }, time: 90, upkeep: 4, speed: 45,
    requires: { building: "siege-workshop", level: 1 },
    description: "Each ram breaks 2% of the enemy's City Gate bonus.",
    wallBreak: 0.02,
  },
  {
    id: "catapult", name: "Catapult", icon: "☄️", attack: 75, defense: 4, carry: 0,
    cost: { iron: 250, wood: 300, clay: 150, crop: 60 }, time: 150, upkeep: 6, speed: 55,
    requires: { building: "siege-workshop", level: 5 },
    description: "Huge attack but the slowest unit. Each catapult breaks 3% of the enemy's Watchtower defense.",
    towerBreak: 0.03,
  },
  {
    id: "longship", name: "Longship", icon: "⛵", attack: 0, defense: 0, carry: 300,
    cost: { iron: 80, wood: 260, clay: 40, crop: 60 }, time: 120, upkeep: 2, speed: 8,
    requires: { building: "harbor", level: 1 },
    description: "Carries 20 foot soldiers (10 horsemen, 5 siege engines) across the sea, plus 300 loot. Never fights; it waits off the beach and sails the survivors home.",
    transport: 20,
  },
];

export const UNIT_BY_ID = Object.fromEntries(UNITS.map((u) => [u.id, u])) as Record<UnitId, UnitDef>;

/** A troop's name for many of them: Spearmen, Axemen, Light Cavalry, Archers. */
export const unitPlural = (id: UnitId) => {
  const name = UNIT_BY_ID[id].name;

  if (name.endsWith("man")) return `${name.slice(0, -3)}men`;
  if (name.endsWith("Cavalry")) return name;

  return `${name}s`;
};

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

/** Seconds an army is away on a raid before it comes home with loot (used when no map distance is known). */
export const RAID_TRAVEL_SECONDS = 90;
export const CAMP_TRAVEL_SECONDS = 45;

// ─── World map ───────────────────────────────────────────────────────────────

/**
 * The world: tiles from MAP_MIN up to (not including) MAP_MAX on both axes,
 * MAP_SIZE across. It began as 0–120; it grew evenly round the same middle
 * (MAP_CENTER), so every tile that existed keeps its land and every tribe
 * its home, and new tribes keep spiralling out from where the first settled.
 * Coordinates can be negative.
 */
export const MAP_CENTER = 60;
export const MAP_SIZE = 400;
export const MAP_MIN = MAP_CENTER - MAP_SIZE / 2;
export const MAP_MAX = MAP_CENTER + MAP_SIZE / 2;
/** Tiles between neighbouring tribes when new players are placed. */
export const TRIBE_SPACING = 4;
/** Shortest possible one-way march. */
export const MIN_MARCH_SECONDS = 20;
/** Scouting costs this many coins per tile of distance (needs an Exploration Center). */
export const SCOUT_COST_PER_TILE = 10;
export const SCOUT_MIN_COST = 30;
/** Anti-cavalry troops (Spearmen) defend this much better against the mounted share of an attack. */
export const ANTI_CAVALRY_BONUS = 0.5;
/** Mounted troops lose this much attack when fighting in a forest. */
export const FOREST_CAVALRY_PENALTY = 0.25;

/** New players can't be attacked for this long. */
export const NEW_PLAYER_SHIELD_MS = 72 * 3600 * 1000;
/** After being raided, a tribe can't be raided again for this long. */
export const RAIDED_SHIELD_MS = 2 * 3600 * 1000;

/** Luck swings each battle by up to ±10%. */
export const LUCK = 0.1;

// Battles last a while once the armies meet, longer the more troops fight.
export const BATTLE_MIN_MS = 60_000;
export const BATTLE_MAX_MS = 30 * 60_000;
/** Battle length grows with the square root of the troops on the field: 100 troops ≈ 3½ min, 1,000 ≈ 10½ min. */
export const BATTLE_MS_PER_SQRT_TROOP = 20_000;
export const BATTLE_MIN_ROUNDS = 3;
export const BATTLE_MAX_ROUNDS = 10;
/** Barbarians in a camp, for the battle's length: about one per 20 defense. */
export const CAMP_DEFENSE_PER_TROOP = 20;

// Barbarian camps (PvE)
//
// Camps never run out. Up to CAMP_STEEP_UNTIL each one is a big step up from
// the last (as they always were); past it they grow gently, so the next camp
// stays a goal rather than a wall: camp 40 needs about 3× camp 30's army,
// where the old curve would have needed 20×.
/** The last camp on the steep curve. Camps past it follow the gentle one. */
export const CAMP_STEEP_UNTIL = 30;
/** Past CAMP_STEEP_UNTIL: defense and first-win resources grow by these per level. */
export const CAMP_LATE_DEFENSE_GROWTH = 1.12;
export const CAMP_LATE_REWARD_GROWTH = 1.1;
/** Is there a camp at this level? (Every whole level from 1 up.) */
export const isCampLevel = (level: number) => Number.isInteger(level) && level >= 1;
const steepDefense = (level: number) => 80 * Math.pow(1.35, level - 1);
const steepResources = (level: number) => 400 * Math.pow(1.3, level - 1);
export const campDefense = (level: number) =>
  Math.round(
    level <= CAMP_STEEP_UNTIL
      ? steepDefense(level)
      : steepDefense(CAMP_STEEP_UNTIL) * Math.pow(CAMP_LATE_DEFENSE_GROWTH, level - CAMP_STEEP_UNTIL),
  );
/** Reward for clearing a camp level the first time (each resource + coins). */
export const campFirstReward = (level: number) => ({
  resources: Math.round(
    level <= CAMP_STEEP_UNTIL
      ? steepResources(level)
      : steepResources(CAMP_STEEP_UNTIL) * Math.pow(CAMP_LATE_REWARD_GROWTH, level - CAMP_STEEP_UNTIL),
  ),
  coins: 100 * level,
});
/** Cleared camps can be raided again for a smaller haul after this cooldown. */
export const CAMP_REPEAT_COOLDOWN_MS = 60 * 60 * 1000;
export const CAMP_REPEAT_SHARE = 0.3;

// ─── Bandits ─────────────────────────────────────────────────────────────────
//
// Bandit lairs sit in the wilds between villages, the same for every player.
// Merchants and armies whose road passes close by can be ambushed: bandits
// steal part of a merchant's load and cut into armies too weak to scare them
// off. Any player can clear a lair; it stays empty for a while, then new
// bandits move in.

export const BANDIT = {
  /** The world is cut into squares this many tiles wide; some hold one lair. */
  cell: 10,
  /** Share of squares with a lair. */
  spawn: 0.5,
  /** Lairs keep at least this far from every village. */
  tribeDistance: 3,
  /** Travellers passing within this many tiles of a lair can be ambushed. */
  reach: 1.5,
  /** Chance that a lair the road passes strikes: merchants, armies. */
  merchantChance: 0.35,
  armyChance: 0.4,
  /** Bandits leave alone an army this many times their strength. */
  shyRatio: 3,
  /** A cleared lair stays empty this long. */
  respawnMs: 6 * 3600 * 1000,
  /** Most lair level. */
  maxLevel: 5,
  /** Guards for a merchant's load cost this many coins per resource carried (and at least minGuardCost). */
  guardPerResource: 0.04,
  minGuardCost: 10,
} as const;

/** How hard a lair fights. Level 1 ≈ 5 Swordsmen, level 5 ≈ 50. */
export const banditStrength = (level: number) => Math.round(150 * Math.pow(1.8, level - 1));
/** Share of a merchant's load a lair's bandits steal. */
export const banditTheft = (level: number) => 0.25 + 0.05 * level;
/** What clearing a lair brings home (each resource + coins). */
export const lairBounty = (level: number) => ({
  resources: Math.round(300 * Math.pow(1.5, level - 1)),
  coins: 80 * level,
});
/** Coins to hire guards for a load of `amount`. */
export const guardCost = (amount: number) =>
  Math.max(BANDIT.minGuardCost, Math.ceil(amount * BANDIT.guardPerResource));

// ─── New orders on the road ─────────────────────────────────────────────────────
//
// An army out on an expedition (marching to a target, or on its way home with
// the spoils) can be given a new target from where it stands. It can leave
// troops behind, who walk home, but it can never grow. Each new order costs
// field supplies, paid from the loot it carries first and from home storage
// after that. How many new orders one expedition can take is set by the War
// Orders card.

export const REDIRECT = {
  /** New orders one expedition can take without the card. */
  baseOrders: 1,
  /** Share of the troops' training cost spent on supplies for each new order. */
  supplyShare: 0.05,
  /** War Orders card: each level lets an expedition take one more new order. */
  maxCardLevel: 4,
  /** Coins to raise the card from level `i` to `i + 1`. */
  cardCost: [2000, 5000, 12000, 30000],
};

// ─── Sea and ships ─────────────────────────────────────────────────────────────
//
// Armies can't walk on the sea. A march whose path crosses open water needs
// enough Longships for every troop, sails that part of the way, and lands on
// the enemy's beach — where the defenders hold the advantage.

/** Defenders fight this much better against an army landing from the sea. */
export const LANDING_DEFENSE = 0.25;

/** Room a troop takes on a ship: foot soldiers 1, horsemen 2, siege engines 4. */
export const unitSlots = (u: UnitDef) => (u.transport ? 0 : u.wallBreak || u.towerBreak ? 4 : u.mounted ? 2 : 1);

// ─── Troop ranks ───────────────────────────────────────────────────────────────
//
// Every troop type is one regiment. Battles give it experience (XP); enough XP
// promotes it to the next rank, and each rank makes the whole regiment
// stronger. Only the troop types that fought in a battle gain XP, shared by
// how much each contributed. Heavy losses cost XP, because veterans die too.

export type RankDef = { name: string; xp: number };

export const RANKS: RankDef[] = [
  { name: "Recruit", xp: 0 },
  { name: "Soldier", xp: 100 },
  { name: "Veteran", xp: 400 },
  { name: "Elite", xp: 1200 },
  { name: "Champion", xp: 3500 },
  { name: "Legend", xp: 10000 },
];
export const MAX_RANK = RANKS.length - 1;

/** Each rank adds this much attack and defense to the regiment. */
export const RANK_BONUS = 0.04;
/** XP for a battle = enemy strength × this (×0.5 for a defeat), shared by the troop types that fought. */
export const XP_PER_STRENGTH = 0.2;
export const XP_DEFEAT_SHARE = 0.5;
/** Losing a share of a regiment costs this share of its XP (losing all of it costs 40%). */
export const XP_LOSS_SHARE = 0.4;

