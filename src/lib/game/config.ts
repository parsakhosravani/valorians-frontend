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

/**
 * Base resource gained per tap at a given "Earn more" level, and daily
 * stamina at a given "Stamina" level. Were ×1.2 and ×1.15 a level: maxed, a
 * day of mining brought ~3M resources, five times a top village's whole
 * output, and already at level 15 it matched it, for a few weeks of coins.
 * Now a maxed day is ~100–300k with combos (under half a day's top
 * production): still the big early boost it's meant to be (level 1 mining is
 * worth about half a new village's day), never the main income.
 */
export const tapPowerForLevel = (level: number) =>
  Math.round(30 * Math.pow(1.1, level - 1));

export const energyCapacityForLevel = (level: number) =>
  Math.round(1500 * Math.pow(1.07, level - 1));

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

// Every building has a top level (maxLevel, usually 20) and can't be built
// higher than the Town Hall (producers and the Warehouse may run
// TOWN_HALL_LEAD ahead). Before Nov 2026 there was no top: costs grew ×1.45 a
// level while effects grew by a fixed step, so levels past ~20 cost hundreds
// of hours of production for almost nothing, and +5% attack a level had no
// ceiling (Arsenal 20 = +100%). A top makes each level a visible goal and
// keeps old tribes beatable; the last levels (see STEEP_FROM) are a long climb
// so a tribe that plays every day still needs months to finish its village.

export type BuildingEffect =
  | { kind: "production"; resource: ResourceId; perLevel: number }
  | { kind: "cropBoost"; percentPerLevel: number }
  | { kind: "warehouse"; multiplierPerLevel: number }
  | { kind: "townHall" }
  | { kind: "coins"; perLevel: number; growth?: number }
  | { kind: "population"; perLevel: number }
  | { kind: "tapBoost"; percentPerLevel: number }
  | { kind: "military"; stat: MilitaryStat; perLevel: number; growth?: number };

/** What a military building improves, per level. */
type MilitaryStat =
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
  | "traps" // % of attackers caught before the battle (see TRAP_MAX)
  | "dragon" // hatches the dragon; % stronger dragon per level past the first
  | "seaDefense"; // % more defense against armies landing from the sea

export type BuildingDef = {
  id: string;
  name: string;
  /** Average cost per resource for level 0 → 1 (the four together cost 4× this). */
  baseCost: number;
  /** How that cost splits over iron, wood, clay, crop (BUILDING_MIX). */
  mix: Record<ResourceId, number>;
  /** Build time relative to an ordinary building (1); see buildingUpgradeBaseSeconds. */
  timeWeight: number;
  /** How much dearer each level is than the last, up to STEEP_FROM (BUILDING_COST_GROWTH unless set). */
  costGrowth?: number;
  /** The highest level it can reach. */
  maxLevel: number;
  /** May be built TOWN_HALL_LEAD levels above the Town Hall (producers and the Warehouse). */
  leadsTownHall?: boolean;
  effect: BuildingEffect;
  description: string;
};

const EVEN_MIX: Record<ResourceId, number> = { iron: 1, wood: 1, clay: 1, crop: 1 };

/** Most buildings stop at this level. */
export const DEFAULT_MAX_LEVEL = 20;
export const TOWN_HALL = "town-hall";
/** Producers and the Warehouse may be this many levels above the Town Hall, so a new tribe can start its economy first. */
export const TOWN_HALL_LEAD = 2;

const def = (
  name: string,
  baseCost: number,
  effect: BuildingEffect,
  description: string,
  extra: Partial<Pick<BuildingDef, "maxLevel" | "timeWeight" | "leadsTownHall">> = {}
): BuildingDef => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  baseCost,
  timeWeight: 1,
  maxLevel: DEFAULT_MAX_LEVEL,
  mix: EVEN_MIX,
  effect,
  description,
  ...extra,
});

/**
 * Each building level costs this much more than the last (producers:
 * PRODUCER_COST_GROWTH), until STEEP_FROM. Was ×1.45 (×1.3 producers) with no
 * top, which made level 20 cost 1,700× level 1; now level 15 costs ~55× level
 * 1 and every level fits the Warehouse its Town Hall allows.
 */
const BUILDING_COST_GROWTH = 1.33;
const PRODUCER_COST_GROWTH = 1.28;
/**
 * Upgrades to level 16 and above get dearer by STEEP_GROWTH a level instead:
 * the last five levels are the late game, ~90% of what a whole village costs.
 * With the gentle curve all the way, a maxed village cost ~6M of each resource
 * (~40 days of top production): an active tribe ran out of things to build in
 * 2–3 months. Now it's ~45M (~75 days of top production; months more with the
 * slow start and an army to feed).
 */
export const STEEP_FROM = 15;
const STEEP_GROWTH = 1.8;
/** Each level yields PRODUCTION_GROWTH more than the last (see productionAt). */
const PRODUCTION_GROWTH = 1.15;
/**
 * Seconds for level 0 → 1 of an ordinary building; each level takes
 * BUILD_TIME_GROWTH longer than the last. Was 10 s × 1.4: the first ten levels
 * finished in seconds (nothing to plan) and level 30 took 3 days. Now level 1
 * is 40 s, level 10 ~20 min, level 15 ~2½ h, level 20 ~16 h, before the Town Hall.
 */
const BUILD_BASE_SECONDS = 40;
const BUILD_TIME_GROWTH = 1.466;

/** How much dearer level `level` → `level + 1` is than level 0 → 1. */
const costFactor = (growth: number, level: number) =>
  Math.pow(growth, Math.min(level, STEEP_FROM - 1)) * Math.pow(STEEP_GROWTH, Math.max(0, level - (STEEP_FROM - 1)));

/** What each resource costs to go from `level` to `level + 1`, split by the building's mix. */
export const buildingUpgradeCost = (b: BuildingDef, level: number): Record<ResourceId, number> => {
  const avg = b.baseCost * costFactor(b.costGrowth ?? BUILDING_COST_GROWTH, level);

  return Object.fromEntries(RESOURCE_IDS.map((r) => [r, Math.round(avg * b.mix[r])])) as Record<ResourceId, number>;
};

/** All four resources of an upgrade added up: for sorting by price. */
export const costTotal = (cost: Record<ResourceId, number>) => RESOURCE_IDS.reduce((sum, r) => sum + cost[r], 0);

/** Raw seconds to go from `level` to `level + 1`, before Town Hall speedup. */
export const buildingUpgradeBaseSeconds = (b: BuildingDef, level: number) =>
  Math.round(BUILD_BASE_SECONDS * b.timeWeight * Math.pow(BUILD_TIME_GROWTH, level));

/** perLevel at level 1, and each level `growth`× the step before it: the sum over `level` levels. */
export const compoundAt = (perLevel: number, level: number, growth: number) =>
  level > 0 ? (perLevel * (Math.pow(growth, level) - 1)) / (growth - 1) : 0;

/** What a producer yields per hour at a level: `perLevel` at level 1, and each level PRODUCTION_GROWTH× the last. */
export const productionAt = (perLevel: number, level: number) => compoundAt(perLevel, level, PRODUCTION_GROWTH);

/** An effect at a level: a straight step a level, or a compounding one when it has a `growth`. */
export const effectAt = (e: { perLevel: number; growth?: number }, level: number) =>
  e.growth ? compoundAt(e.perLevel, level, e.growth) : e.perLevel * level;

/** Most of a raid's attackers the Trapmaker's traps can catch. */
export const TRAP_MAX = 0.25;
/** Most of the warehouse a Hideout can keep hidden, however high it's built. */
export const HIDEOUT_MAX_SHARE = 0.4;

/** Shields after being raided, by how many times you were raided in the day before (2 h, then 6 h, then 12 h). */
export const RAIDED_SHIELDS_MS = [2, 6, 12].map((h) => h * 3600 * 1000);
/** Raiding a tribe under this share of your power takes only LOOT_WEAK_SHARE of the usual loot. */
export const WEAK_TARGET_RATIO = 0.5;
export const LOOT_WEAK_SHARE = 0.5;

/**
 * Starvation: when crop runs out and more is eaten than grown, troops at
 * home desert, the hungriest first: up to this share of them each hour,
 * until what's left can be fed.
 */
export const DESERT_PER_HOUR = 0.02;

/**
 * What each building is made of: its share of iron, wood, clay and crop, as
 * [iron, wood, clay, crop]. Every row adds up to 4, so a level costs the same
 * in total as when all four were equal; only the split changed. Before, every
 * building wanted the same amount of each (a City Gate took as much crop as
 * clay), which made no sense: walls are brick, ships are wood, smiths are iron.
 * Producers barely need what they make, so building one doesn't eat its own
 * output. Crop stays in every recipe, a little, to feed the workers.
 */
const BUILDING_MIX: Record<BuildingId, Record<ResourceId, number>> = Object.fromEntries(
  (
    [
      ["town-hall", [0.9, 1.2, 1.4, 0.5]],
      ["resource-warehouse", [0.8, 1.6, 1.2, 0.4]],
      ["iron-mine", [0.4, 1.6, 1.3, 0.7]],
      ["sawmill", [1.3, 0.4, 1.5, 0.8]],
      ["brickyard", [1.3, 1.6, 0.4, 0.7]],
      ["windmill", [1.0, 1.6, 1.0, 0.4]],
      ["fertilizer-workshop", [0.8, 1.2, 1.0, 1.0]],
      ["treasury", [1.6, 0.6, 1.4, 0.4]], // an iron-bound vault in stone
      ["trading-post", [0.6, 1.5, 0.8, 1.1]], // carts and stalls, food for the caravans
      ["academy", [0.6, 1.4, 1.4, 0.6]],
      ["embassy", [0.5, 1.0, 1.1, 1.4]], // feasts for guests
      ["barracks", [1.2, 1.4, 0.9, 0.5]],
      ["stable", [0.9, 1.5, 0.8, 0.8]], // horses eat
      ["siege-workshop", [1.2, 1.7, 0.7, 0.4]],
      ["military-command", [1.0, 1.0, 1.4, 0.6]],
      ["arsenal", [1.7, 1.0, 0.8, 0.5]], // weapons are forged
      ["armory", [1.7, 0.8, 1.0, 0.5]], // so is armour
      ["city-gate", [1.1, 0.8, 1.8, 0.3]], // brick first, then iron, then wood, a little food
      ["watchtower", [0.8, 1.3, 1.6, 0.3]],
      ["trapmaker", [1.3, 1.6, 0.6, 0.5]],
      ["hideout", [0.6, 1.3, 1.7, 0.4]],
      ["hospital", [0.6, 1.0, 1.2, 1.2]],
      ["war-hall", [1.0, 1.2, 1.3, 0.5]],
      ["exploration-center", [0.8, 1.6, 0.9, 0.7]],
      ["dragon-roost", [1.1, 0.7, 1.2, 1.0]], // the dragon eats
      ["harbor", [0.7, 2.0, 0.9, 0.4]], // longships are mostly timber
    ] as [string, number[]][]
  ).map(([id, m]) => [id, Object.fromEntries(RESOURCE_IDS.map((r, i) => [r, m[i]])) as Record<ResourceId, number>])
);

const producer = (b: BuildingDef): BuildingDef => ({ ...b, costGrowth: PRODUCER_COST_GROWTH, leadsTownHall: true, timeWeight: 0.8 });

// Effects are set so the top level gives a round, readable maximum:
// Arsenal/Armory +40%, City Gate +60%, Military Command and War Hall 50%,
// Hospital 50%, Trapmaker 25%. (They were +5%/+6% a level with no top.)
export const BUILDINGS: BuildingDef[] = [
  def("Town Hall", 300, { kind: "townHall" }, "Builds 2.5% faster per level (up to 50% at level 20). A second builder at level 10, a third at 20. No other building can be higher than it.", { timeWeight: 1.5 }),
  def("Resource Warehouse", 200, { kind: "warehouse", multiplierPerLevel: 1.22 }, "+22% storage for every resource per level.", { leadsTownHall: true, timeWeight: 0.8 }),
  producer(def("Iron Mine", 150, { kind: "production", resource: "iron", perLevel: 60 }, "+60 iron per hour at level 1, and each level adds 15% more than the last.")),
  producer(def("Sawmill", 150, { kind: "production", resource: "wood", perLevel: 60 }, "+60 wood per hour at level 1, and each level adds 15% more than the last.")),
  producer(def("Brickyard", 150, { kind: "production", resource: "clay", perLevel: 60 }, "+60 clay per hour at level 1, and each level adds 15% more than the last.")),
  producer(def("Windmill", 150, { kind: "production", resource: "crop", perLevel: 60 }, "+60 crop per hour at level 1, and each level adds 15% more than the last.")),
  def("Fertilizer Workshop", 250, { kind: "cropBoost", percentPerLevel: 5 }, "+5% crop production per level (up to +100%)."),
  // Coins grow 10% a level like production, so a high Treasury is still worth building (was +40 flat).
  def("Treasury", 300, { kind: "coins", perLevel: 40, growth: 1.1 }, "+40 coins per hour at level 1, and each level adds 10% more than the last."),
  def("Trading Post", 250, { kind: "coins", perLevel: 20 }, "+20 coins per hour. Each level adds a Market merchant (one more offer) and lets loads carry 15% more."),
  def("Academy", 300, { kind: "tapBoost", percentPerLevel: 5 }, "+5% resources per strike per level (up to +50%).", { maxLevel: 10 }),
  def("Embassy", 250, { kind: "population", perLevel: 3 }, "+3 extra population growth per hour per level."),
  // Unlock buildings stop at their last unlock: higher levels did nothing.
  def("Barracks", 250, { kind: "military", stat: "unlock", perLevel: 0 }, "Trains Spearmen (level 1), Swordsmen (2), Archers (3) and Axemen (5).", { maxLevel: 5 }),
  def("Stable", 300, { kind: "military", stat: "unlock", perLevel: 0 }, "Trains Light Cavalry (level 1), Paladins (3) and Knights (10).", { maxLevel: 10 }),
  def("Siege Workshop", 350, { kind: "military", stat: "unlock", perLevel: 0 }, "Builds Battering Rams (level 1) that break walls and Catapults (level 5) that break towers.", { maxLevel: 5 }),
  def("Military Command", 400, { kind: "military", stat: "trainSpeed", perLevel: 2.5 }, "Troops train 2.5% faster per level (up to 50%)."),
  def("Arsenal", 300, { kind: "military", stat: "attack", perLevel: 2 }, "+2% attack for all troops per level (up to +40%)."),
  def("Armory", 250, { kind: "military", stat: "defense", perLevel: 2 }, "+2% defense for all troops per level (up to +40%)."),
  def("City Gate", 200, { kind: "military", stat: "wall", perLevel: 3 }, "+3% defense per level (up to +60%). Enemy rams can break it."),
  // Grows 12% a level so it still counts against big late armies (was +60 flat: 1,200 at level 20, now ~4,300).
  def("Watchtower", 200, { kind: "military", stat: "flatDefense", perLevel: 60, growth: 1.12 }, "+60 defense points at level 1, and each level adds 12% more, even with no troops home."),
  def("Trapmaker", 200, { kind: "military", stat: "traps", perLevel: 1.25 }, "Traps catch 1.25% of attackers per level before the battle starts (up to 25%)."),
  def("Hideout", 200, { kind: "military", stat: "protect", perLevel: 0 }, "Hides more of each resource from raiders every level."),
  def("Hospital", 250, { kind: "military", stat: "heal", perLevel: 2.5 }, "Treats the wounded after a battle: saves 2.5% of them per level (up to 50%). The killed can't be saved."),
  def("War hall", 350, { kind: "military", stat: "march", perLevel: 2.5 }, "Armies come home 2.5% faster per level (up to 50%)."),
  def("Exploration Center", 300, { kind: "military", stat: "scout", perLevel: 0 }, "Reveals enemies' exact defense before you attack, and sends spies.", { maxLevel: 1 }),
  def("Dragon Roost", 5000, { kind: "military", stat: "dragon", perLevel: 15 }, "Hatches your one dragon (level 1), and makes it 15% stronger every level after (up to level 10).", { maxLevel: 10, timeWeight: 3 }),
  def("Harbor", 300, { kind: "military", stat: "seaDefense", perLevel: 3 }, "Builds Longships (level 1) to carry armies across the sea. +3% defense against landings from the sea per level (up to +60%)."),
].map((b) => ({ ...b, mix: BUILDING_MIX[b.id] ?? b.mix }));

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



/** Town Hall: 2.5% faster building a level, so 50% at level 20 (was 4% up to 80%). */
export const TOWN_HALL_SPEEDUP_PER_LEVEL = 0.025;
/**
 * Town Hall levels that each bring one more builder. It was one every 5
 * levels with no end (Town Hall 30 = 7 builders), which let old tribes build
 * everything at once and made the Plus builder worthless to them.
 */
export const TOWN_HALL_BUILDER_LEVELS = [10, 20];

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
  /**
   * Fewest members a clan needs before its techs work. A chief alone could
   * found a clan just to buy themselves perks; a clan is a band, so its techs
   * stay asleep (no perks, no raising) until a second chief joins.
   */
  minMembers: 2,
  /**
   * Clan level: techs can be raised this many levels per clan level. When
   * every tech reaches the cap the clan levels up and the cap rises by this
   * much again. No top level for now: tech costs grow so fast that keeping
   * all four techs raised is already the hard part.
   */
  techLevelsPerClanLevel: 5,
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

export const UNIT_IDS = ["spearman", "swordsman", "archer", "axeman", "cavalry", "paladin", "knight", "ram", "catapult", "longship", "dragon"] as const;
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
  /** Defends better against the foot-soldier share of an attack (see ANTI_INFANTRY_BONUS). */
  antiInfantry?: boolean;
  /**
   * City Gate levels each one breaks for the battle (see siegeBreak). Was a
   * share of the gate per ram (2%), so 50 rams undid any gate, even a City
   * Gate 20 that took months: now a bigger gate needs more rams.
   */
  wallBreak?: number;
  /** Watchtower levels each one breaks for the battle (was a 3% share per catapult). */
  towerBreak?: number;
  /** Share of the City Gate and the Watchtower it breaks whatever their level (the dragon's fire). */
  fireBreak?: number;
  /**
   * A ship: carries this many troop slots across the sea (see unitSlots). Ships
   * never fight; they wait off the beach and sail the survivors home. For
   * ships `speed` is the sailing speed.
   */
  transport?: number;
  /** Flies: alone, it goes straight to its target over sea and mountains (no ships, no bandits). */
  flying?: boolean;
  /** Only this many per tribe, ever (home, training and away together). */
  maxOwned?: number;
};

/**
 * Troops (Nov 2026 rebalance). Every troop has one job, and higher tiers buy
 * efficiency with a deeper unlock:
 * - Spearman: the cheapest defense, best against horsemen.
 * - Archer: defends best against foot soldiers (and the dragon).
 * - Swordsman: the all-rounder.
 * - Axeman: the most attack for its crop, but it can't defend.
 * - Light Cavalry: the raider, fastest with the biggest carry.
 * - Paladin: the fast defender, the most defense for its crop.
 * - Knight: the elite, the most attack for its cost and training time.
 * Before, Axemen (Barracks 5) beat Knights (Stable 10) at attack per resource
 * (21 vs 16 per 100) and per crop (45 vs 25), Archers were a weaker Axeman,
 * and Spearmen did a Paladin's job for a quarter of the crop.
 */
export const UNITS: UnitDef[] = [
  {
    id: "spearman", name: "Spearman", icon: "🔱", attack: 12, defense: 22, carry: 25,
    cost: { iron: 24, wood: 43, clay: 19, crop: 14 }, time: 20, upkeep: 1, speed: 30,
    requires: { building: "barracks", level: 1 },
    description: "Cheap, sturdy defender. Strong against cavalry.",
    antiCavalry: true,
  },
  {
    id: "swordsman", name: "Swordsman", icon: "🗡️", attack: 30, defense: 25, carry: 40,
    cost: { iron: 74, wood: 42, clay: 48, crop: 26 }, time: 30, upkeep: 1, speed: 30,
    requires: { building: "barracks", level: 2 },
    description: "Well-armored all-rounder. Good in attack and defense.",
  },
  {
    id: "archer", name: "Archer", icon: "🏹", attack: 15, defense: 20, carry: 20,
    cost: { iron: 32, wood: 51, clay: 14, crop: 18 }, time: 22, upkeep: 1, speed: 27,
    requires: { building: "barracks", level: 3 },
    description: "Defender from the walls. Strong against foot soldiers, and shoots down dragons.",
    antiInfantry: true,
  },
  {
    id: "axeman", name: "Axeman", icon: "🪓", attack: 45, defense: 10, carry: 45,
    cost: { iron: 93, wood: 66, clay: 33, crop: 38 }, time: 40, upkeep: 1, speed: 30,
    requires: { building: "barracks", level: 5 },
    description: "The most attack for the crop it eats, but weak in defense.",
  },
  {
    id: "cavalry", name: "Light Cavalry", icon: "🐎", attack: 40, defense: 20, carry: 100,
    cost: { iron: 111, wood: 67, clay: 44, crop: 78 }, time: 50, upkeep: 2, speed: 10,
    requires: { building: "stable", level: 1 },
    description: "The raider: the fastest troop, and carries the most loot. Weak in forests and against spears.",
    mounted: true,
  },
  {
    id: "paladin", name: "Paladin", icon: "🐴", attack: 30, defense: 60, carry: 60,
    cost: { iron: 137, wood: 97, clay: 98, crop: 68 }, time: 60, upkeep: 2, speed: 14,
    requires: { building: "stable", level: 3 },
    description: "Defensive horseman. The most defense for its crop, and rides fast to help.",
    mounted: true,
  },
  {
    id: "knight", name: "Knight", icon: "🛡️🗡️", attack: 120, defense: 45, carry: 80,
    cost: { iron: 213, wood: 155, clay: 145, crop: 87 }, time: 90, upkeep: 3, speed: 14,
    requires: { building: "stable", level: 10 },
    description: "Heavy armored knight. The most attack for its cost and training time.",
    mounted: true,
  },
  {
    id: "ram", name: "Battering Ram", icon: "🪵", attack: 30, defense: 5, carry: 0,
    cost: { iron: 120, wood: 180, clay: 80, crop: 40 }, time: 90, upkeep: 3, speed: 45,
    requires: { building: "siege-workshop", level: 1 },
    description: "Every 10 rams break one level of the enemy's City Gate for the battle.",
    wallBreak: 0.1,
  },
  {
    id: "catapult", name: "Catapult", icon: "☄️", attack: 75, defense: 4, carry: 0,
    cost: { iron: 250, wood: 300, clay: 150, crop: 60 }, time: 150, upkeep: 6, speed: 55,
    requires: { building: "siege-workshop", level: 5 },
    description: "Huge attack but the slowest unit. Every 8 catapults break one level of the enemy's Watchtower for the battle.",
    towerBreak: 0.125,
  },
  {
    id: "longship", name: "Longship", icon: "⛵", attack: 0, defense: 0, carry: 300,
    cost: { iron: 80, wood: 260, clay: 40, crop: 60 }, time: 120, upkeep: 2, speed: 8,
    requires: { building: "harbor", level: 1 },
    description: "Carries 20 foot soldiers (10 horsemen, 5 siege engines) across the sea, plus 300 loot. Never fights; it waits off the beach and sails the survivors home.",
    transport: 20,
  },
  {
    id: "dragon", name: "Dragon", icon: "🐉", attack: 4000, defense: 3000, carry: 0,
    cost: { iron: 60000, wood: 60000, clay: 60000, crop: 60000 }, time: 24 * 3600, upkeep: 40, speed: 4,
    requires: { building: "dragon-roost", level: 1 },
    description:
      "One per tribe. Flies straight to any target, over seas and mountains, too fast for bandits. Its fire breaks half of a City Gate and a Watchtower. Carries no loot. Never dies: beaten, it comes home wounded and rests 12 hours. Archers hit it hard.",
    flying: true,
    maxOwned: 1,
    fireBreak: 0.5,
  },
];

/**
 * The dragon (see UNITS): stronger by `perRoostLevel` for every Dragon Roost
 * level past the first, up to the Roost's top (level 10: +135%); beaten, it rests `restMs` once home;
 * Archers defend `archerBonus` better against the share of an attack it makes.
 */
export const DRAGON = { perRoostLevel: 0.15, restMs: 12 * 3600 * 1000, archerBonus: 2 } as const;

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

/**
 * People a troop takes from the population when it's trained: one per crop it
 * eats (a Spearman 1, a Knight 3). Soldiers come from your people, so the
 * population is spent on armies and lost in battle, instead of only being a
 * score that grows by itself. The dragon is hatched, not recruited.
 */
export const unitPeople = (u: UnitDef) => (u.maxOwned ? 0 : u.upkeep);

/**
 * Every tribe has some militia even with no troops: 50, and 0.1 per person,
 * up to MILITIA_MAX. Population never stops growing, so without a top the
 * militia alone would one day hold off real armies.
 */
export const MILITIA_MAX = 2000;
export const militiaDefense = (population: number) => Math.round(Math.min(MILITIA_MAX, 50 + population * 0.1));

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

/**
 * A place as players see it: "12, -40", counted from the middle of the world
 * (world tile minus MAP_CENTER). Every coordinate shown in the game, in its
 * messages and typed into "Go to" uses this; tiles themselves never change.
 */
export const shownXY = (p: { x: number; y: number }) =>
  `${Math.round(p.x) - MAP_CENTER}, ${Math.round(p.y) - MAP_CENTER}`;
/** Tiles between neighbouring tribes when new players are placed. */
export const TRIBE_SPACING = 4;
/** Shortest possible one-way march. */
export const MIN_MARCH_SECONDS = 20;
/** Scouting costs this many coins per tile of distance (needs an Exploration Center). */
/**
 * Spies (needs an Exploration Center): planted on a tribe for `durationMs`,
 * a spy sends word the moment that tribe's army marches out, so you can hit
 * the village while it's away. Costs `costFactor`× a scouting trip; up to
 * `maxActive` at once. The target's Watchtower may catch one as it's
 * planted (`catchPerLevel` a level, up to `catchMax`): the coins are lost
 * and the target learns who sent it.
 */
export const SPY = {
  durationMs: 24 * 3600 * 1000,
  costFactor: 3,
  maxActive: 3,
  catchPerLevel: 0.04,
  catchMax: 0.6,
} as const;

export const SCOUT_COST_PER_TILE = 10;
export const SCOUT_MIN_COST = 30;
/** Anti-cavalry troops (Spearmen) defend this much better against the mounted share of an attack. */
export const ANTI_CAVALRY_BONUS = 0.5;
/**
 * Anti-infantry troops (Archers) defend this much better against the foot
 * soldiers' share of an attack. With the Spearmen against horsemen it makes a
 * rock-paper-scissors: an attacker mixes foot and horse, a defender spears and bows.
 */
export const ANTI_INFANTRY_BONUS = 0.5;
/** Mounted troops lose this much attack when fighting in a forest. */
export const FOREST_CAVALRY_PENALTY = 0.25;

/** New players can't be attacked for this long. */
export const NEW_PLAYER_SHIELD_MS = 72 * 3600 * 1000;

/** Luck swings each battle by up to ±10%. */
export const LUCK = 0.1;

// Battles last a while once the armies meet, longer the more troops fight.
export const BATTLE_MIN_MS = 60_000;
export const BATTLE_MAX_MS = 30 * 60_000;
/** Battle length grows with the square root of the troops on the field: 100 troops ≈ 3½ min, 1,000 ≈ 10½ min. */
export const BATTLE_MS_PER_SQRT_TROOP = 20_000;
export const BATTLE_MIN_ROUNDS = 3;
export const BATTLE_MAX_ROUNDS = 10;
/**
 * An army coming home to a village under attack joins the fight, and the
 * battle goes on with them. Each join can add rounds, but never past this.
 */
export const BATTLE_MAX_ROUNDS_REINFORCED = 20;
/** An empty village's defense, in troops for how long the battle lasts: a village of 3,000 defense counts as 10. */
export const EMPTY_VILLAGE_DEFENSE_PER_TROOP = 300;
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
/** Past CAMP_STEEP_UNTIL: defense grows by this per level. */
const CAMP_LATE_DEFENSE_GROWTH = 1.12;
/**
 * Past CAMP_STEEP_UNTIL, first-win resources grow by this share of camp 30's
 * reward per level, in a straight line rather than compounding: camp 40 pays
 * 1.4× camp 30 and camp 60 2.2×, while the barbarians keep getting tougher.
 * (Compounding 10% a level paid camp 50 almost 7× and outran players' villages.)
 */
const CAMP_LATE_REWARD_STEP = 0.04;
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
      : steepResources(CAMP_STEEP_UNTIL) * (1 + CAMP_LATE_REWARD_STEP * (level - CAMP_STEEP_UNTIL)),
  ),
  coins: 100 * level,
});
/**
 * Each camp's name: a warlord's or a place's, with a word for how tough it is
 * (Camp, Hold, Fortress, Citadel). The same level always has the same name.
 */
const CAMP_ADJECTIVES = ["Burnt", "Howling", "Red", "Broken", "Ashen", "Iron", "Bloody", "Silent", "Black", "Frozen", "Rotten", "Wild"];
const CAMP_WARLORDS = ["Grul", "Varka", "Thorg", "Bresk", "Ulmar", "Krag", "Dosk", "Hilda", "Morv", "Skarn", "Brann", "Yrsa"];
export const campTier = (level: number) => (level <= 10 ? "Camp" : level <= 20 ? "Hold" : level <= 30 ? "Fortress" : "Citadel");
export function campName(level: number) {
  const words = level % 2 ? CAMP_ADJECTIVES : CAMP_WARLORDS;
  // Step through the list by 5 (no common factor with 12) so neighbours differ.
  const word = words[(Math.floor(level / 2) * 5) % words.length];
  return level % 2 ? `${word} ${campTier(level)}` : `${word}'s ${campTier(level)}`;
}
/**
 * Cleared camps can be raided again for a smaller haul after this cooldown:
 * CAMP_REPEAT_SHARE of the first reward, but never more than
 * CAMP_REPEAT_HOURS of the tribe's own production. Was every hour for 30%
 * with no cap: three camps around level 30 farmed hourly paid ~40× a top
 * village's production, so camps became the whole economy. Now farming all
 * the camps you keep (CAMPS_KEPT) about doubles your income at most.
 */
export const CAMP_REPEAT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const CAMP_REPEAT_SHARE = 0.3;
export const CAMP_REPEAT_HOURS = 2;
/**
 * Only your newest beaten camps stay on the map to raid again; older ones are
 * gone (they still count as beaten). Keeps the map tidy and stops sweeping
 * every old camp each cooldown.
 */
export const CAMPS_KEPT = 3;

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

/**
 * Bandit raids on villages. A manned lair within `reach` tiles of a village
 * can gather to raid it: the player gets `warnMs` of warning (on the map, in
 * the Hall and on Telegram) to train defenders or clear the lair first, which
 * calls the raid off. The bandits come about as strong as the village's
 * defense when they gather (×`strengthMin`–`strengthMax`), so it's a real
 * fight that a little preparation wins. Only players who come back to the game
 * get raided (it's checked when they open it), never under a shield, and at
 * most one raid every `everyMs`.
 *
 * Losing costs `steal` of what isn't hidden in the Hideout and `defenderLoss`
 * of the troops at home: never the City Gate, never the whole army. Winning
 * kills a few defenders, clears the lair, and pays its bounty and battle XP.
 */
export const BANDIT_RAID = {
  reach: 7,
  warnMs: 3 * 3600 * 1000,
  everyMs: 20 * 3600 * 1000,
  /** Chance a raid gathers when one could; if not, look again this much later. */
  chance: 0.5,
  retryMs: 6 * 3600 * 1000,
  strengthMin: 0.65,
  strengthMax: 1.15,
  steal: 0.15,
  defenderLoss: 0.2,
} as const;
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
// Flyers fly alongside the ships, taking no room on them.
export const unitSlots = (u: UnitDef) => (u.transport || u.flying ? 0 : u.wallBreak || u.towerBreak ? 4 : u.mounted ? 2 : 1);

// ─── Troop ranks ───────────────────────────────────────────────────────────────
//
// Every troop type is one regiment. Battles give it experience (XP); enough XP
// promotes it to the next rank, and each rank makes the whole regiment
// stronger. Only the troop types that fought in a battle gain XP, shared by
// how much each contributed. Heavy losses cost XP, because veterans die too.

type RankDef = { name: string; xp: number };

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
/**
 * XP for a battle = XP_SCALE × enemy strength ^ XP_POWER (×XP_DEFEAT_SHARE for a
 * defeat), shared by the troop types that fought. Was a straight 0.2 × strength:
 * enemies grow ×1.35 a camp, so one late battle (camp 20: ~4,800 XP) carried a
 * regiment half way to Legend and ranks were maxed weeks into the game. Grown
 * by a power under 1, a camp 1 battle gives about the same as before (~17) and
 * a camp 20 one ~700: Legend comes around camp 25–30, months in.
 */
export const XP_SCALE = 1;
export const XP_POWER = 0.65;
export const XP_DEFEAT_SHARE = 0.5;
/** Barbarians already beaten teach less: a repeat camp raid gives this share of the XP. */
export const XP_REPEAT_CAMP_SHARE = 0.3;
/**
 * Experience lives in the soldiers: losing a share of a regiment costs that same
 * share of its XP, and a regiment that is wiped out loses all of it (owner's rule).
 */
export const XP_LOSS_SHARE = 1;

