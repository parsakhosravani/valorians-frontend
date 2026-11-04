/**
 * Clan rules shared by the server (authoritative) and the client (rendering).
 * No I/O here: flags, clan techs, their costs and the perks members get.
 */
import { CLAN, RESOURCE_IDS, ResourceId, WONDER, table } from "./config";

// ─── Flags ───────────────────────────────────────────────────────────────────
//
// A clan flag is a Norse war banner: a field colour, a pattern in a second
// colour, and an emblem in the middle. Stored as small numbers/ids so it is
// cheap to send with every clan in a list.

export const FLAG_COLORS = [
  "#8E1B1B", // blood red
  "#C2571A", // ember
  "#D9A53A", // gold
  "#2F6B3A", // pine
  "#1F5E73", // fjord
  "#24366E", // night blue
  "#5B2C6F", // royal purple
  "#2A2420", // raven black
  "#E9DFC9", // bone
  "#6E7B85", // iron grey
] as const;

export const FLAG_PATTERNS = [
  { id: "plain", name: "Plain" },
  { id: "cross", name: "Nordic cross" },
  { id: "fess", name: "Band" },
  { id: "pale", name: "Pale" },
  { id: "split", name: "Split" },
  { id: "chevron", name: "Chevron" },
  { id: "saltire", name: "Saltire" },
  { id: "quarters", name: "Quarters" },
  { id: "border", name: "Border" },
] as const;

export type FlagPattern = (typeof FLAG_PATTERNS)[number]["id"];

export const FLAG_EMBLEMS = [
  "🐺", "🐻", "🦅", "🐉", "🦁", "🐗", "🐍", "🦌",
  "⚔️", "🪓", "🏹", "🛡️", "🔨", "⚓", "👑", "💀",
  "🔥", "⚡", "🌙", "☀️", "❄️", "🌲", "⛰️", "🌊",
] as const;

/** Painted crest for each emblem, same order as FLAG_EMBLEMS (public/images/emblems/<name>.webp). */
const EMBLEM_IMAGES = [
  "wolf", "bear", "eagle", "dragon", "lion", "boar", "serpent", "stag",
  "swords", "axe", "bow", "shield", "hammer", "anchor", "crown", "skull",
  "flame", "lightning", "moon", "sun", "snowflake", "pine", "mountain", "wave",
] as const;

export const emblemImage = (i: number) => (EMBLEM_IMAGES[i] ? `/images/emblems/${EMBLEM_IMAGES[i]}.webp` : null);

export type ClanFlag = {
  /** Field colour (index into FLAG_COLORS). */
  bg: number;
  /** Pattern colour (index into FLAG_COLORS). */
  fg: number;
  pattern: FlagPattern;
  /** Emblem (index into FLAG_EMBLEMS), or -1 for none. */
  emblem: number;
};

const PATTERN_IDS = FLAG_PATTERNS.map((p) => p.id) as string[];

/** Every clan gets a distinct-looking flag even before anyone designs one. */
export function defaultFlag(seed: number): ClanFlag {
  let h = (Math.abs(Math.floor(seed)) * 2654435761) >>> 0;
  const next = (n: number) => {
    h = (h ^ (h >>> 13)) * 1274126177;
    h = (h ^ (h >>> 16)) >>> 0;

    return h % n;
  };
  const bg = next(FLAG_COLORS.length);
  let fg = next(FLAG_COLORS.length);

  if (fg === bg) fg = (bg + 2) % FLAG_COLORS.length;

  return { bg, fg, pattern: FLAG_PATTERNS[next(FLAG_PATTERNS.length)].id, emblem: next(FLAG_EMBLEMS.length) };
}

const index = (v: unknown, n: number) => {
  const i = Number(v);

  return Number.isInteger(i) && i >= 0 && i < n ? i : null;
};

/** Checks a flag sent by a client. Returns null if any part is invalid. */
export function parseFlag(v: unknown): ClanFlag | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const bg = index(o.bg, FLAG_COLORS.length);
  const fg = index(o.fg, FLAG_COLORS.length);
  const emblem = Number(o.emblem) === -1 ? -1 : index(o.emblem, FLAG_EMBLEMS.length);
  const pattern = String(o.pattern);

  if (bg == null || fg == null || emblem == null || !PATTERN_IDS.includes(pattern)) return null;

  return { bg, fg, emblem, pattern: pattern as FlagPattern };
}

/** Reads a flag stored in the database, falling back to the clan's default. */
export function storedFlag(json: unknown, clanId: number): ClanFlag {
  if (typeof json === "string" && json) {
    try {
      const f = parseFlag(JSON.parse(json));

      if (f) return f;
    } catch {
      // fall through to the default
    }
  }

  return defaultFlag(clanId);
}

// ─── Roles ───────────────────────────────────────────────────────────────────

export type ClanRole = "leader" | "officer" | "member";

export const ROLE_NAMES: Record<ClanRole, string> = {
  leader: "Jarl",
  officer: "Huscarl",
  member: "Warrior",
};

/** What each role may do. The leader can do everything. */
export const can = {
  manage: (r: ClanRole) => r === "leader" || r === "officer", // requests, kicks, techs, aid, flag
  promote: (r: ClanRole) => r === "leader",
  settings: (r: ClanRole) => r === "leader", // join policy, transfer leadership
};

/** Officers may only remove plain members; the leader may remove anyone else. */
export const canKick = (actor: ClanRole, target: ClanRole) =>
  actor === "leader" ? target !== "leader" : actor === "officer" && target === "member";

export type JoinMode = "open" | "request" | "closed";
export const JOIN_MODES: { id: JoinMode; name: string; hint: string }[] = [
  { id: "open", name: "Open", hint: "Anyone can join straight away" },
  { id: "request", name: "By request", hint: "Chiefs apply, officers decide" },
  { id: "closed", name: "Closed", hint: "No new members" },
];

// ─── Treasury & techs ────────────────────────────────────────────────────────
//
// Members donate resources and coins to the clan treasury. Officers spend it
// on clan techs, which give every member a perk, or send aid to a member.

export const TREASURY_KEYS = [...RESOURCE_IDS, "coins"] as const;
export type TreasuryKey = (typeof TREASURY_KEYS)[number];
export type Treasury = Record<TreasuryKey, number>;

export const emptyTreasury = (): Treasury => ({ iron: 0, wood: 0, clay: 0, crop: 0, coins: 0 });

export const TECH_IDS = ["hall", "fields", "banners", "shieldwall"] as const;
export type TechId = (typeof TECH_IDS)[number];
export type Techs = Record<TechId, number>;

type TechDef = {
  id: TechId;
  name: string;
  icon: string;
  description: string;
  /** Text for the effect at a given level, e.g. "+6% production". */
  effect: (level: number) => string;
};

export const CLAN_TECHS: TechDef[] = [
  {
    id: "hall",
    name: "Great Hall",
    icon: "🏛️",
    description: "Room for more warriors at the clan's table.",
    effect: (l) => `${CLAN.maxMembers + l * CLAN.seatsPerHallLevel} member seats`,
  },
  {
    id: "fields",
    name: "Shared Fields",
    icon: "🌾",
    description: "Members' iron, wood, clay and crop production rises.",
    effect: (l) => `+${perkLevel(l) * CLAN.fieldsPercent}% resource production${l >= CLAN.perkMaxLevel ? " (top)" : ""}`,
  },
  {
    id: "banners",
    name: "War Banners",
    icon: "🚩",
    description: "Members' armies attack harder.",
    effect: (l) => `+${perkLevel(l) * CLAN.bannersPercent}% attack${l >= CLAN.perkMaxLevel ? " (top)" : ""}`,
  },
  {
    id: "shieldwall",
    name: "Shield Wall",
    icon: "🛡️",
    description: "Members' villages defend better.",
    effect: (l) => `+${perkLevel(l) * CLAN.shieldwallPercent}% defense${l >= CLAN.perkMaxLevel ? " (top)" : ""}`,
  },
];

export const TECH_BY_ID = table(CLAN_TECHS.map((t) => [t.id, t])) as Record<TechId, TechDef>;


/** Treasury cost to raise a tech from `level` to `level + 1`. */
export function techCost(level: number): Treasury {
  const f = Math.pow(CLAN.techCostGrowth, level);
  const res = Math.round((CLAN.techBaseResources * f) / 100) * 100;

  return { iron: res, wood: res, clay: res, crop: res, coins: Math.round((CLAN.techBaseCoins * f) / 50) * 50 };
}

export const canAfford = (t: Treasury, cost: Treasury) => TREASURY_KEYS.every((k) => t[k] >= cost[k]);

export const maxMembers = (techs: Techs) => CLAN.maxMembers + techs.hall * CLAN.seatsPerHallLevel;

/**
 * Clan level: 1, plus one for every full step (CLAN.techLevelsPerClanLevel)
 * that *all* techs have reached. One lagging tech holds the clan back.
 */
export const clanLevel = (techs: Techs) =>
  1 + Math.floor(Math.min(...TECH_IDS.map((id) => techs[id])) / CLAN.techLevelsPerClanLevel);

/** Highest level any tech can reach at the clan's current level (5, then 10, 15, …). */
export const techCap = (techs: Techs) => clanLevel(techs) * CLAN.techLevelsPerClanLevel;

/** A clan with fewer than CLAN.minMembers members is still forming: no perks, no tech raising. */
export const isFormed = (members: number) => members >= CLAN.minMembers;

/** Perks every member of the clan gets, in percent. Stored in their game state. */
export type ClanPerks = { production: number; attack: number; defense: number };

export const NO_PERKS: ClanPerks = { production: 0, attack: 0, defense: 0 };

/** Tech levels past CLAN.perkMaxLevel add no more perk (see CLAN.perkMaxLevel). */
const perkLevel = (level: number) => Math.min(level, CLAN.perkMaxLevel);

/** What every member gets from the clan's techs, or nothing while the clan is still forming. */
export const perksFor = (techs: Techs, members: number): ClanPerks =>
  isFormed(members)
    ? {
        production: perkLevel(techs.fields) * CLAN.fieldsPercent,
        attack: perkLevel(techs.banners) * CLAN.bannersPercent,
        defense: perkLevel(techs.shieldwall) * CLAN.shieldwallPercent,
      }
    : { ...NO_PERKS };

export const samePerks = (a: ClanPerks | undefined, b: ClanPerks) =>
  (a?.production ?? 0) === b.production && (a?.attack ?? 0) === b.attack && (a?.defense ?? 0) === b.defense;

/** How much a donation counts towards a member's contribution score. Coins are worth more. */
export const contributionValue = (key: TreasuryKey, amount: number) =>
  key === "coins" ? amount * CLAN.coinContributionWeight : amount;

/**
 * How much more aid of `key` a member may receive today: CLAN.aidDailyHours of
 * their own hourly output of it (for crop, at least the average of the other
 * three, since troops eat into it), minus what they already got in the last 24 h.
 */
export function aidRoom(
  key: TreasuryKey,
  rates: { productionPerHour: Record<ResourceId, number>; coinsPerHour: number },
  receivedToday: number
) {
  const p = rates.productionPerHour;
  const hourly =
    key === "coins"
      ? rates.coinsPerHour
      : key === "crop"
        ? Math.max(p.crop, (p.iron + p.wood + p.clay) / 3)
        : p[key];

  return Math.max(0, Math.floor(CLAN.aidDailyHours * Math.max(0, hourly) - receivedToday));
}

/**
 * Why `target` can't get aid from the treasury, or null if they can. The Jarl
 * and Huscarls spend the treasury, so they never receive from it, and a former
 * Huscarl waits CLAN.aidAfterRankMs after losing the rank (see config).
 */
export function aidRefusal(target: ClanRole, lostRankAt: number | null, now: number): string | null {
  if (target !== "member") return `The ${ROLE_NAMES.leader} and ${ROLE_NAMES.officer}s spend the treasury, so they can't get aid from it`;
  if (lostRankAt != null && now - lostRankAt < CLAN.aidAfterRankMs)
    return `A former ${ROLE_NAMES.officer} can get aid ${CLAN.aidAfterRankMs / 86400e3} days after losing the rank`;

  return null;
}

/** A member who joined less than CLAN.aidMinTenureMs ago can't receive aid yet. */
export const aidTooSoon = (joinedAt: number | null, now: number) => joinedAt == null || now - joinedAt < CLAN.aidMinTenureMs;

export const isResource = (k: string): k is ResourceId => (RESOURCE_IDS as readonly string[]).includes(k);
export const isTreasuryKey = (k: string): k is TreasuryKey => (TREASURY_KEYS as readonly string[]).includes(k);

// ─── World Wonder ────────────────────────────────────────────────────────────

/** Treasury cost to raise the Wonder from `level` to `level + 1`. */
export function wonderCost(level: number): Treasury {
  const f = Math.pow(WONDER.growth, level);
  const res = Math.round((WONDER.baseResources * f) / 1000) * 1000;

  return { iron: res, wood: res, clay: res, crop: res, coins: Math.round((WONDER.baseCoins * f) / 100) * 100 };
}

/**
 * Why the clan can't raise its Wonder now, or null. `nextAt` is when the wait
 * after the last level ends.
 */
export function wonderBlocked(c: { techs: Techs; members: number; level: number; nextAt: number; treasury: Treasury }, now: number) {
  if (!isFormed(c.members)) return `A clan needs at least ${CLAN.minMembers} members`;
  if (clanLevel(c.techs) < WONDER.minClanLevel) return `Reach clan level ${WONDER.minClanLevel} to start a Wonder`;
  if (c.level >= WONDER.levels) return "The Wonder stands complete";
  if (now < c.nextAt) return "The builders are still at work on the last level";
  if (!canAfford(c.treasury, wonderCost(c.level))) return "The treasury can't cover the next level yet";

  return null;
}
