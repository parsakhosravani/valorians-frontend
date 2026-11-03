/**
 * Advice for the Build and Hall screens: what can be upgraded now, what is
 * missing, and which upgrade is the best next step. Pure functions.
 */
import { BUILDINGS, BuildingDef, RESOURCE_IDS, ResourceId, RESOURCE_NAMES, TOWN_HALL_BUILDER_LEVELS, TOWN_HALL_SPEEDUP_PER_LEVEL, productionAt, costTotal, effectAt } from "./config";
import { GameState, buildingUpgradeInfo, getRates } from "./engine";

export type BuildingGroup = "economy" | "military" | "defense";

export const GROUP_LABEL: Record<BuildingGroup, string> = {
  economy: "Economy",
  military: "Military",
  defense: "Defense",
};

export const buildingGroup = (b: BuildingDef): BuildingGroup => {
  if (b.effect.kind !== "military") return "economy";
  return ["defense", "wall", "flatDefense", "protect"].includes(b.effect.stat) ? "defense" : "military";
};

/** One short line on what the next level gives. */
export const nextLevelGain = (b: BuildingDef, level = 0): string => {
  const e = b.effect;

  switch (e.kind) {
    case "production":
      return `+${Math.round(productionAt(e.perLevel, level + 1) - productionAt(e.perLevel, level))} ${RESOURCE_NAMES[e.resource].toLowerCase()}/h`;
    case "cropBoost":
      return `+${e.percentPerLevel}% crop`;
    case "warehouse":
      return `+${Math.round((e.multiplierPerLevel - 1) * 100)}% storage`;
    case "townHall":
      return TOWN_HALL_BUILDER_LEVELS.includes(level + 1) ? "One more builder" : `Builds ${TOWN_HALL_SPEEDUP_PER_LEVEL * 100}% faster`;
    case "coins":
      return `+${Math.round(effectAt(e, level + 1) - effectAt(e, level))} coins/h`;
    case "population":
      return `+${e.perLevel} pop./h`;
    case "tapBoost":
      return `+${e.percentPerLevel}% per strike`;
    case "military":
      switch (e.stat) {
        case "trainSpeed":
          return `${e.perLevel}% faster training`;
        case "attack":
          return `+${e.perLevel}% attack`;
        case "defense":
          return `+${e.perLevel}% defense`;
        case "wall":
          return `+${e.perLevel}% wall defense`;
        case "flatDefense":
          return `+${Math.round(effectAt(e, level + 1) - effectAt(e, level))} defense`;
        case "dragon":
          return level === 0 ? "Hatches your dragon" : `Dragon ${e.perLevel}% stronger`;
        case "traps":
          return `Traps catch ${e.perLevel}% more attackers`;
        case "protect":
          return "Hides more resources";
        case "march":
          return `${e.perLevel}% faster return`;
        case "heal":
          return `Saves ${e.perLevel}% more wounded`;
        case "seaDefense":
          return `+${e.perLevel}% vs sea landings`;
        default:
          return b.description;
      }
  }
};

export type UpgradeOption = {
  building: BuildingDef;
  level: number;
  /** Level after this upgrade. */
  toLevel: number;
  cost: Record<ResourceId, number>;
  seconds: number;
  /** Being upgraded right now. */
  job?: { toLevel: number; startedAt: number; endsAt: number };
  /** How much of each resource is still missing. */
  missing: Partial<Record<ResourceId, number>>;
  affordable: boolean;
  /** Hours until production covers what is missing; null if it never will. */
  hoursToAfford: number | null;
  /** Why it can't be upgraded whatever the resources (top level, Town Hall too low…), or null. */
  blocked: string | null;
};

export function upgradeOptions(state: GameState): UpgradeOption[] {
  const rates = getRates(state);

  return BUILDINGS.map((b) => {
    const info = buildingUpgradeInfo(state, b.id);
    const missing: Partial<Record<ResourceId, number>> = {};
    let hours = 0;

    for (const r of RESOURCE_IDS) {
      const short = info.cost[r] - state.resources[r];

      if (short > 0) {
        missing[r] = Math.ceil(short);
        const perHour = rates.productionPerHour[r];
        // Storage caps what can pile up, so an upgrade above capacity never comes.
        hours = perHour > 0 && info.cost[r] <= rates.capacity ? Math.max(hours, short / perHour) : Infinity;
      }
    }

    return {
      building: b,
      level: state.buildings[b.id] ?? 0,
      toLevel: info.from + 1,
      cost: info.cost,
      seconds: info.seconds,
      job: state.queue.find((q) => q.building === b.id),
      missing,
      affordable: Object.keys(missing).length === 0,
      hoursToAfford: Number.isFinite(hours) && !info.blocked ? hours : null,
      blocked: info.blocked,
    };
  });
}

export const canStart = (o: UpgradeOption) => o.affordable && !o.job && !o.blocked;

type Advice = { id: string; reason: string };

/** The single most useful upgrade to start now, or null if none can start. */
export function recommendUpgrade(state: GameState, options = upgradeOptions(state)): Advice | null {
  const rates = getRates(state);

  if (state.queue.length >= rates.builders) return null;
  const ready = options.filter(canStart);

  if (!ready.length) return null;
  const pick = (id: string) => ready.find((o) => o.building.id === id);

  if (rates.productionPerHour.crop <= 0) {
    const o = pick("windmill") ?? pick("fertilizer-workshop");

    if (o) return { id: o.building.id, reason: "Crop is running out" };
  }
  if (RESOURCE_IDS.some((r) => state.resources[r] >= rates.capacity * 0.9)) {
    const o = pick("resource-warehouse");

    if (o) return { id: o.building.id, reason: "Storage is almost full" };
  }
  const hall = pick("town-hall");

  if (hall && TOWN_HALL_BUILDER_LEVELS.includes(hall.toLevel)) return { id: "town-hall", reason: "Unlocks another builder" };
  // Everything else is waiting on the Town Hall: raise it.
  if (hall && !ready.some((o) => o.building.id !== "town-hall")) return { id: "town-hall", reason: "Lets other buildings grow" };
  const producers = ready.filter((o) => o.building.effect.kind === "production");

  if (producers.length) {
    const weakest = [...producers].sort((a, b) => {
      const ra = a.building.effect.kind === "production" ? rates.productionPerHour[a.building.effect.resource] : 0;
      const rb = b.building.effect.kind === "production" ? rates.productionPerHour[b.building.effect.resource] : 0;

      return ra - rb;
    })[0];

    return { id: weakest.building.id, reason: "Boosts your weakest resource" };
  }
  const cheapest = [...ready].sort((a, b) => costTotal(a.cost) - costTotal(b.cost))[0];

  return { id: cheapest.building.id, reason: "Cheapest upgrade" };
}
