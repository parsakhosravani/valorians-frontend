/**
 * War rules: training troops, resolving battles, raids and barbarian camps.
 * Pure functions like the rest of the engine — the server supplies time and
 * randomness so results can't be faked from the browser.
 */
import {
  BUILDINGS,
  CAMP_REPEAT_COOLDOWN_MS,
  CAMP_REPEAT_SHARE,
  CAMP_TRAVEL_SECONDS,
  FOREST_CAVALRY_PENALTY,
  LUCK,
  MAX_BATCH,
  isCampLevel,
  MAX_LOOT_SHARE,
  RAIDED_SHIELDS_MS,
  WEAK_TARGET_RATIO,
  LOOT_WEAK_SHARE,
  RAID_TRAVEL_SECONDS,
  RESOURCE_IDS,
  ResourceId,
  ANTI_CAVALRY_BONUS,
  UNITS,
  UNIT_BY_ID,
  UNIT_IDS,
  UnitId,
  campDefense,
  campFirstReward,
  militiaDefense,
  MAX_RANK,
  RANKS,
  XP_DEFEAT_SHARE,
  XP_LOSS_SHARE,
  XP_PER_STRENGTH,
  LANDING_DEFENSE,
  REDIRECT,
  banditStrength,
  lairBounty,
} from "./config";
import {
  Army,
  GameError,
  GameState,
  HOUR,
  breakShield,
  cloneState,
  emptyArmy,
  getRates,
  maxTrainBatches,
  totalArmy,
  trainingEndsAt,
  rankForXp,
  unitMultiplier,
  unitRank,
} from "./engine";
import { Point, SHIP_ID, TERRAIN, Terrain, shipsNeeded } from "./map";
import type { BattleRound } from "./battle";

/** Troops that fight (everything but ships). */
const FIGHTERS = UNIT_IDS.filter((u) => !UNIT_BY_ID[u].transport);

export type Loot = Record<ResourceId, number>;

const emptyLoot = (): Loot => ({ iron: 0, wood: 0, clay: 0, crop: 0 });

const lootTotal = (l: Partial<Loot> | undefined) => RESOURCE_IDS.reduce((a, r) => a + (l?.[r] ?? 0), 0);

export const armySize = (a: Army) => UNIT_IDS.reduce((n, u) => n + (a[u] ?? 0), 0);

/** Troops in an army, not counting the ships carrying them. */
export const fighterCount = (a: Army) => FIGHTERS.reduce((n, u) => n + (a[u] ?? 0), 0);

export function unitUnlocked(s: GameState, unit: UnitId) {
  const req = UNIT_BY_ID[unit].requires;
  return (s.buildings[req.building] ?? 0) >= req.level;
}

// ─── Training ────────────────────────────────────────────────────────────────

export function trainTroops(s0: GameState, unit: UnitId, count: number, now: number): GameState {
  const def = UNIT_BY_ID[unit];
  if (!def) throw new GameError("Unknown unit");
  count = Math.floor(count);
  if (!(count >= 1 && count <= MAX_BATCH)) throw new GameError(`Train between 1 and ${MAX_BATCH} at a time`);
  if (!unitUnlocked(s0, unit)) {
    const b = BUILDINGS.find((x) => x.id === def.requires.building)!;
    throw new GameError(`Needs ${b.name} level ${def.requires.level}`, "locked");
  }
  if (s0.training.length >= maxTrainBatches(s0)) throw new GameError("Training queue is full", "queue_full");

  const s = cloneState(s0);
  for (const r of RESOURCE_IDS) {
    if (s.resources[r] < def.cost[r] * count) throw new GameError(`Not enough ${r}`, "not_enough_resources");
  }
  for (const r of RESOURCE_IDS) s.resources[r] -= def.cost[r] * count;

  const lastEnd = s.training.reduce((m, t) => Math.max(m, trainingEndsAt(t)), now);
  s.training.push({
    unit,
    count,
    startsAt: lastEnd,
    perUnitMs: Math.max(1000, Math.round(def.time * 1000 * getRates(s).trainSpeedMultiplier)),
    done: 0,
  });
  return s;
}

/** Resources handed back when a batch is cancelled: the full cost of every unit not yet trained. */
export function trainingRefund(t: { unit: UnitId; count: number; done: number }) {
  const left = t.count - t.done;
  const cost = UNIT_BY_ID[t.unit].cost;

  return Object.fromEntries(RESOURCE_IDS.map((r) => [r, cost[r] * left])) as Record<ResourceId, number>;
}

/**
 * Cancels a training batch (found by its start time). Units already trained stay in the army,
 * the rest are refunded up to the storage limit, and the batches behind it move up the queue.
 */
export function cancelTraining(s0: GameState, startsAt: number, now: number): GameState {
  const i = s0.training.findIndex((t) => t.startsAt === startsAt);
  if (i < 0) throw new GameError("That training has already finished", "not_found");

  const s = cloneState(s0);
  const [batch] = s.training.splice(i, 1);
  const refund = trainingRefund(batch);
  const cap = getRates(s).capacity;
  for (const r of RESOURCE_IDS) {
    if (refund[r] > 0) s.resources[r] = Math.max(s.resources[r], Math.min(cap, s.resources[r] + refund[r]));
  }

  // Batches that haven't started yet close the gap; ones already running keep their timing.
  let cursor = now;
  for (const t of s.training) {
    if (t.startsAt <= now) cursor = Math.max(cursor, trainingEndsAt(t));
    else {
      t.startsAt = cursor;
      cursor = trainingEndsAt(t);
    }
  }

  return s;
}

// ─── Battle maths ────────────────────────────────────────────────────────────

/** Attack of one troop of this type, with its rank and upgrades (before buildings). */
export const unitAttack = (s: GameState, u: UnitId) => UNIT_BY_ID[u].attack * unitMultiplier(s, u);
/** Defense of one troop of this type, with its rank and upgrades (before buildings). */
export const unitDefense = (s: GameState, u: UnitId) => UNIT_BY_ID[u].defense * unitMultiplier(s, u);

export function attackPower(s: GameState, units: Army) {
  const raw = UNIT_IDS.reduce((sum, u) => sum + unitAttack(s, u) * (units[u] ?? 0), 0);
  return raw * (1 + getRates(s).attackBonus);
}

/** How much of the enemy's City Gate (wall) and Watchtower (tower) an attacking army breaks, 0–1. */
function siegeBreak(sent: Army) {
  let wall = 0;
  let tower = 0;
  for (const u of UNITS) {
    wall += (u.wallBreak ?? 0) * (sent[u.id] ?? 0);
    tower += (u.towerBreak ?? 0) * (sent[u.id] ?? 0);
  }
  return { wall: Math.min(1, wall), tower: Math.min(1, tower) };
}

/** Defense of a tribe against an attack by `sent` (its siege engines break walls and towers). */
export function defensePower(s: GameState, sent?: Army) {
  const r = getRates(s);
  const troops = UNIT_IDS.reduce((sum, u) => sum + unitDefense(s, u) * s.army[u], 0);
  const br = sent ? siegeBreak(sent) : { wall: 0, tower: 0 };
  const wall = r.wallBonus * (1 - br.wall);
  const tower = r.flatDefense * (1 - br.tower);
  return (troops + tower + militiaDefense(s.population)) * (1 + r.defenseBonus) * (1 + wall);
}

/**
 * Attack and defense for one battle, with the strategy rules applied:
 * - the defender's terrain adds defense (hills +20%, forest +10%)
 * - mounted troops (Light Cavalry, Paladins, Knights) fight 25% weaker in a forest
 * - anti-cavalry troops (Spearmen) defend 50% better against the mounted share of the attack
 * - rams break the City Gate, catapults break the Watchtower
 * - an army landing from the sea fights uphill: the defenders get +25%, and
 *   their Harbor adds more
 * `defender` is null for a barbarian camp, which uses `campDef`.
 */
export function battleNumbers(
  attacker: GameState,
  sent: Army,
  defender: GameState | null,
  terrain: Terrain = "plains",
  campDef = 0,
  landing = false
) {
  const bonus = 1 + getRates(attacker).attackBonus;
  let cav = UNITS.filter((u) => u.mounted).reduce((a, u) => a + unitAttack(attacker, u.id) * (sent[u.id] ?? 0), 0) * bonus;
  const rest = attackPower(attacker, sent) - cav;

  if (terrain === "forest") cav *= 1 - FOREST_CAVALRY_PENALTY;
  const attack = rest + cav;
  const cavShare = attack > 0 ? cav / attack : 0;
  const ground = 1 + TERRAIN[terrain].defense;
  let defense: number;

  if (defender) {
    const r = getRates(defender);
    const spears =
      UNITS.filter((u) => u.antiCavalry).reduce((a, u) => a + unitDefense(defender, u.id) * defender.army[u.id], 0) *
      (1 + r.defenseBonus);

    defense = defensePower(defender, sent) * ground + spears * ANTI_CAVALRY_BONUS * cavShare;
    if (landing) defense *= landingFactor(defender);
  } else {
    defense = campDef * ground;
  }

  return { attack, defense };
}

/** How much harder a tribe is to take from the sea: the beach, plus its Harbor. */
const landingFactor = (defender: GameState) => 1 + LANDING_DEFENSE + getRates(defender).seaDefenseBonus;

/** The same, from the Harbor level alone (it's visible on the map). */
export const landingFactorFor = (harborLevel: number) => {
  const e = BUILDINGS.find((b) => b.id === "harbor")!.effect;
  const perLevel = e.kind === "military" ? e.perLevel : 0;

  return 1 + LANDING_DEFENSE + (perLevel * harborLevel) / 100;
};

export function powerScore(s: GameState) {
  const army = totalArmy(s);
  const troops = UNIT_IDS.reduce((sum, u) => sum + ((unitAttack(s, u) + unitDefense(s, u)) / 2) * army[u], 0);
  const buildings = Object.values(s.buildings).reduce((a, b) => a + b, 0);
  return Math.round(troops + buildings * 10);
}

export type BattleOutcome = {
  attackerWon: boolean;
  attack: number;
  defense: number;
  luck: number;
  attackerLosses: Army;
  attackerHealed: Army;
  defenderLosses: Army;
  defenderHealed: Army;
  /** XP each troop type earned (missing in reports from before ranks existed). */
  attackerXp?: Army;
  defenderXp?: Army;
  /** Attackers caught in the defender's traps before the battle (counted in attackerLosses). */
  attackerTrapped?: Army;
  /** Troop types that reached a new rank in this battle. */
  attackerPromoted?: Promotion[];
  defenderPromoted?: Promotion[];
};

export type Promotion = { unit: UnitId; rank: number };

// ─── Ranks and experience ────────────────────────────────────────────────────

/**
 * XP from one battle, shared by the troop types that fought in proportion to
 * how much they contributed (attack when attacking, defense when defending).
 */
export function battleXp(s: GameState, fought: Army, enemyStrength: number, won: boolean, as: "attack" | "defense"): Army {
  const xp = emptyArmy();
  const weight = (u: UnitId) => (as === "attack" ? unitAttack(s, u) : unitDefense(s, u)) * (fought[u] ?? 0);
  const total = UNIT_IDS.reduce((a, u) => a + weight(u), 0);
  if (total <= 0) return xp;
  const pool = enemyStrength * XP_PER_STRENGTH * (won ? 1 : XP_DEFEAT_SHARE);
  for (const u of UNIT_IDS) xp[u] = Math.round((pool * weight(u)) / total);
  return xp;
}

/**
 * Applies a battle to the regiments: losses cost XP (a share of the veterans
 * died), then the earned XP is added. `regiment` is each type's size before
 * the battle. Returns the types that went up a rank.
 */
function applyBattleXp(s: GameState, regiment: Army, dead: Army, earned: Army): Promotion[] {
  const promoted: Promotion[] = [];
  for (const u of UNIT_IDS) {
    const t = s.troops[u];
    const before = rankForXp(t.xp);
    if (regiment[u] > 0 && dead[u] > 0) {
      t.xp *= 1 - XP_LOSS_SHARE * Math.min(1, dead[u] / regiment[u]);
    }
    t.xp = Math.round(t.xp + (earned[u] ?? 0));
    const after = rankForXp(t.xp);
    if (after > before) promoted.push({ unit: u, rank: after });
  }
  return promoted;
}

/** Rank and XP progress of one troop type, for display. */
export function troopInfo(s: GameState, u: UnitId) {
  const t = s.troops[u];
  const rank = unitRank(s, u);
  const next = rank < MAX_RANK ? RANKS[rank + 1] : null;
  const floor = RANKS[rank].xp;
  return {
    rank,
    rankName: RANKS[rank].name,
    xp: t.xp,
    nextRank: next ? { name: next.name, xp: next.xp } : null,
    progress: next ? (t.xp - floor) / (next.xp - floor) : 1,
    multiplier: unitMultiplier(s, u),
  };
}

/** Each type's full regiment (home + away) plus troops currently in a battle. */
const regimentWith = (s: GameState, fighting: Army) => {
  const r = totalArmy(s);
  for (const u of UNIT_IDS) r[u] += fighting[u] ?? 0;
  return r;
};

/**
 * Of the troops who fall in a battle, the share who are only wounded rather
 * than killed. The winners hold the field and carry their wounded off; the
 * losers' wounded are mostly left behind. Only the wounded can be saved by a
 * Hospital: the dead are gone.
 */
export const WOUNDED_SHARE = { won: 0.6, lost: 0.3 };

/** Losses for each side. The loser is wiped out; the winner loses (loser/winner)^1.5. */
function resolve(
  attack: number,
  defense: number,
  luck: number,
  sent: Army,
  defenders: Army,
  attackerHeal: number,
  defenderHeal: number
): BattleOutcome {
  const a = attack * luck;
  const attackerWon = a > defense;
  const attackerShare = attackerWon ? Math.pow(defense / a, 1.5) : 1;
  const defenderShare = attackerWon ? 1 : Math.pow(a / Math.max(1, defense), 1.5);

  const lose = (army: Army, share: number, heal: number, won: boolean) => {
    const losses = emptyArmy();
    const healed = emptyArmy();
    // Ships never fight: they wait off the beach and are never lost.
    for (const u of FIGHTERS) {
      const fallen = Math.min(army[u], Math.round(army[u] * share));
      // The Hospital treats the wounded only: never the killed.
      const wounded = Math.round(fallen * (won ? WOUNDED_SHARE.won : WOUNDED_SHARE.lost));
      healed[u] = Math.floor(wounded * heal);
      losses[u] = fallen - healed[u];
    }
    // A narrow win can round every unit to dead. The winner always keeps at
    // least one unit (the best carrier), or nobody would march the loot home.
    if (won && fighterCount(army) > 0 && FIGHTERS.every((u) => losses[u] >= army[u])) {
      const keep = FIGHTERS.filter((u) => army[u] > 0).reduce((best, u) =>
        UNIT_BY_ID[u].carry > UNIT_BY_ID[best].carry ? u : best
      );
      losses[keep] -= 1;
    }
    return { losses, healed };
  };
  const at = lose(sent, attackerShare, attackerHeal, attackerWon);
  const df = lose(defenders, defenderShare, defenderHeal, !attackerWon);
  return {
    attackerWon,
    attack: Math.round(a),
    defense: Math.round(defense),
    luck,
    attackerLosses: at.losses,
    attackerHealed: at.healed,
    defenderLosses: df.losses,
    defenderHealed: df.healed,
  };
}

/** `rand` in [0,1) → luck multiplier in [1-LUCK, 1+LUCK]. */
export const luckFrom = (rand: number) => 1 - LUCK + rand * 2 * LUCK;

function validateSend(s: GameState, units: Army): Army {
  const clean = emptyArmy();
  for (const u of UNIT_IDS) {
    const n = Math.floor(Number(units?.[u] ?? 0));
    if (n < 0 || !Number.isFinite(n)) throw new GameError("Bad troop count");
    if (n > s.army[u]) throw new GameError(`You only have ${s.army[u]} ${UNIT_BY_ID[u].name} at home`, "not_enough_troops");
    clean[u] = n;
  }
  if (fighterCount(clean) === 0) throw new GameError("Choose some troops to send", "no_troops");
  return clean;
}

/**
 * Puts an army on ships when its path crosses the sea: exactly the Longships
 * it needs go along (more would just sit idle). Over land, ships stay home.
 */
export function embark(s: GameState, units: Army, naval: boolean): Army {
  const out = { ...emptyArmy(), ...units, [SHIP_ID]: 0 } as Army;
  if (!naval) return out;
  const need = shipsNeeded(out);
  const have = s.army[SHIP_ID] ?? 0;
  if (need > have) {
    throw new GameError(
      have === 0 && (s.buildings["harbor"] ?? 0) === 0
        ? "That's across the sea. Build a Harbor and Longships to carry your army."
        : `Crossing the sea takes ${need} Longships for these troops; you have ${have} at home.`,
      "need_ships"
    );
  }
  out[SHIP_ID] = need;
  return out;
}

export const carryOf = (units: Army) => UNITS.reduce((sum, u) => sum + u.carry * (units[u.id] ?? 0), 0);

/**
 * What an army that won keeps of the spoils it already carried into the
 * battle: all of it while the survivors can carry it, less when too many fell.
 */
function keptSpoils(carried: Loot | undefined, carry: number): Loot {
  const kept = emptyLoot();
  const total = lootTotal(carried);
  if (!carried || total <= 0) return kept;
  const f = Math.min(1, carry / total);
  for (const r of RESOURCE_IDS) kept[r] = Math.floor((carried[r] ?? 0) * f);
  return kept;
}

const survivorsOf = (sent: Army, losses: Army) => {
  const out = emptyArmy();
  for (const u of UNIT_IDS) out[u] = sent[u] - losses[u];
  return out;
};

const marchId = (now: number, rand: number) => `${now.toString(36)}${Math.floor(rand * 1e6).toString(36)}`;

// ─── Raids on other players ──────────────────────────────────────────────────

/** Step 1: troops leave home. Attacking ends your own shield, bought ones too. */
export function dispatchRaid(s0: GameState, units: Army, now: number) {
  const s = cloneState(s0);
  const sent = validateSend(s, units);
  for (const u of UNIT_IDS) s.army[u] -= sent[u];
  breakShield(s, now);
  return { state: s, sent };
}

/** Puts troops back if the raid couldn't happen. */
export function cancelRaid(s0: GameState, sent: Army): GameState {
  const s = cloneState(s0);
  for (const u of UNIT_IDS) s.army[u] += sent[u];
  return s;
}

export type RaidReport = BattleOutcome & {
  sent: Army;
  defenders: Army;
  loot: Record<ResourceId, number>;
  coins: number;
  returnsAt: number;
  /** How long the fight lasted and how it went, round by round (timed battles only). */
  battleMs?: number;
  rounds?: BattleRound[];
  /**
   * Spoils from an earlier battle the army brought to this one (after new
   * orders on the road). A winner keeps them on top of `loot`; a loser drops them.
   */
  carried?: Loot;
  carriedCoins?: number;
  /** The defender's City Gate, knocked down a level or more by the winners (see gateDamage). */
  gate?: { from: number; to: number };
  /**
   * Why a won raid took nothing: their stores were all hidden in the Hideout
   * (or protected), there was nothing in them, or the survivors had no room left.
   */
  noLoot?: "hidden" | "empty" | "full";
  /** Loot was cut (see LOOT_WEAK_SHARE): the target had under WEAK_TARGET_RATIO of the attacker's power. */
  weakTarget?: boolean;
  /** How long the defender is shielded after this raid (grows when raided again within a day). */
  shieldMs?: number;
};

/**
 * Levels a City Gate loses when the attackers win: one for being stormed at
 * all, even with no rams (an empty tribe still loses some of its gate), and
 * more the more of it their rams broke: half its levels again at full break.
 * One at Gate 11 with no rams; three with rams breaking half of it.
 */
export const gateDamage = (gate: number, sent: Army) =>
  gate > 0 ? Math.min(gate, 1 + Math.floor(siegeBreak(sent).wall * gate * 0.5)) : 0;

/**
 * Step 2: the battle, applied to the defender. Returns the defender's new
 * state and the report the attacker needs.
 */
type MapOpts = {
  terrain?: Terrain;
  /** One-way march time; the army gets home this long after the battle. */
  travelMs?: number;
  /** Where the battle was, so the march home can be drawn. */
  from?: Point;
  /** The attackers came by sea and have to land on the beach. */
  landing?: boolean;
  /**
   * The battle was already decided when the armies met (see battle.ts); apply
   * this result instead of fighting again.
   */
  outcome?: BattleOutcome;
  /** Defenders who left home to fight this battle; survivors go back home. */
  engaged?: Army;
  /** Spoils the army already carries from an earlier battle of the same expedition. */
  carried?: Loot;
  carriedCoins?: number;
  /** New orders the expedition already took (kept on the march home). */
  hops?: number;
};

/** Only the troops that fight (ships stay out of it). */
const fightersOf = (a: Army) => {
  const out = emptyArmy();
  for (const u of FIGHTERS) out[u] = a[u] ?? 0;
  return out;
};

/**
 * Decides a raid the moment the armies meet, without changing anything:
 * the outcome and the defenders who take the field.
 */
export function raidOutcome(
  defender: GameState,
  attacker: GameState,
  sent: Army,
  rand: number,
  opts: Pick<MapOpts, "terrain" | "landing"> = {}
) {
  const defenders = fightersOf(defender.army);
  // The Trapmaker's traps catch some attackers before the battle starts:
  // they're lost, and the rest fight.
  const trapShare = getRates(defender).trapShare;
  const trapped = emptyArmy();
  const fighting = { ...sent };

  if (trapShare > 0)
    for (const u of FIGHTERS) {
      trapped[u] = Math.floor((sent[u] ?? 0) * trapShare);
      fighting[u] = (sent[u] ?? 0) - trapped[u];
    }
  const nums = battleNumbers(attacker, fighting, defender, opts.terrain, 0, opts.landing);
  const outcome = resolve(
    nums.attack,
    nums.defense,
    luckFrom(rand),
    fighting,
    defenders,
    getRates(attacker).healShare,
    getRates(defender).healShare
  );

  if (armySize(trapped) > 0) {
    for (const u of FIGHTERS) outcome.attackerLosses[u] += trapped[u];
    outcome.attackerTrapped = trapped;
  }
  return { outcome, defenders };
}

/** Defenders leave home for the battlefield while the fight lasts. */
export function engageDefenders(s0: GameState, engaged: Army): GameState {
  const s = cloneState(s0);
  for (const u of UNIT_IDS) s.army[u] = Math.max(0, s.army[u] - (engaged[u] ?? 0));
  return s;
}

/** Puts defenders back home untouched (the battle couldn't be finished). */
export function releaseDefenders(s0: GameState, engaged: Army): GameState {
  const s = cloneState(s0);
  for (const u of UNIT_IDS) s.army[u] += engaged[u] ?? 0;
  return s;
}

/** Decides a camp battle the moment the army arrives, without changing anything. */
export function campOutcome(s: GameState, level: number, sent: Army, rand: number, opts: Pick<MapOpts, "terrain"> = {}) {
  const nums = battleNumbers(s, sent, null, opts.terrain, campDefense(level));
  return resolve(nums.attack, nums.defense, luckFrom(rand), sent, emptyArmy(), getRates(s).healShare, 0);
}

export function defendRaid(
  defender0: GameState,
  attacker: GameState,
  sent: Army,
  now: number,
  rand: number,
  opts: MapOpts = {}
): { state: GameState; report: RaidReport } {
  // A battle that already started is fought to the end, shield or not.
  if (!opts.outcome && defender0.shieldUntil > now) {
    throw new GameError("This tribe is protected by a shield right now", "shielded");
  }
  const d = cloneState(defender0);
  const ar = getRates(attacker);
  const dr = getRates(d);

  const engaged = opts.engaged;
  const defenders = engaged ? { ...emptyArmy(), ...engaged } : { ...d.army };
  const outcome = opts.outcome ?? raidOutcome(d, attacker, sent, rand, opts).outcome;

  // Experience: the defenders learn from the fight, the attackers' share is
  // carried in the report and applied when they get it (receiveRaidReport).
  const won = !outcome.attackerWon;
  const defenderXp = battleXp(d, defenders, outcome.attack, won, "defense");
  const attackerXp = battleXp(attacker, sent, outcome.defense, outcome.attackerWon, "attack");
  const regiment = engaged ? regimentWith(d, engaged) : totalArmy(d);
  const defenderPromoted = applyBattleXp(d, regiment, outcome.defenderLosses, defenderXp);

  // Healed defenders recover at home straight away, so only real losses go.
  for (const u of UNIT_IDS) {
    if (engaged) d.army[u] += (engaged[u] ?? 0) - outcome.defenderLosses[u];
    else d.army[u] -= outcome.defenderLosses[u];
  }

  const loot = emptyLoot();
  let gate: RaidReport["gate"];
  let noLoot: RaidReport["noLoot"];
  let weakTarget = false;
  if (outcome.attackerWon) {
    const survivors = survivorsOf(sent, outcome.attackerLosses);
    // Spoils already on their backs take up room: only the rest fills with new loot.
    const carry = Math.max(0, carryOf(survivors) - lootTotal(keptSpoils(opts.carried, carryOf(survivors))));
    // Picking on a much weaker tribe pays less.
    weakTarget = powerScore(d) < powerScore(attacker) * WEAK_TARGET_RATIO;
    const share = MAX_LOOT_SHARE * (weakTarget ? LOOT_WEAK_SHARE : 1);
    const available = RESOURCE_IDS.map((r) => Math.max(0, d.resources[r] - dr.hidden) * share);
    const total = available.reduce((a, b) => a + b, 0);
    if (total > 0 && carry > 0) {
      const take = Math.min(1, carry / total);
      RESOURCE_IDS.forEach((r, i) => {
        loot[r] = Math.floor(available[i] * take);
        d.resources[r] -= loot[r];
      });
    }
    if (lootTotal(loot) <= 0)
      noLoot = carry <= 0 ? "full" : RESOURCE_IDS.some((r) => d.resources[r] >= 1) ? "hidden" : "empty";
    d.war.defensesLost += 1;
    const from = d.buildings["city-gate"] ?? 0;
    const lost = gateDamage(from, sent);

    if (lost > 0) {
      gate = { from, to: from - lost };
      d.buildings["city-gate"] = gate.to;
      // A rebuild under way carries on from what's left standing.
      for (const q of d.queue) if (q.building === "city-gate") q.toLevel = gate.to + 1;
    }
  } else {
    d.war.defensesWon += 1;
  }
  // The shield grows when the same tribe keeps losing: 2 h, then 6 h, then 12 h within a day.
  const recent = (d.war.raidedAt ?? []).filter((t) => now - t < 24 * 3600e3);
  const shieldMs = RAIDED_SHIELDS_MS[Math.min(RAIDED_SHIELDS_MS.length - 1, outcome.attackerWon ? recent.length : 0)];

  if (outcome.attackerWon) d.war.raidedAt = [...recent, now].slice(-RAIDED_SHIELDS_MS.length);
  d.shieldUntil = now + shieldMs;

  return {
    state: d,
    report: {
      ...outcome,
      attackerXp,
      defenderXp,
      defenderPromoted,
      sent,
      defenders,
      loot,
      coins: 0,
      ...(gate ? { gate } : {}),
      ...(noLoot ? { noLoot } : {}),
      ...(weakTarget ? { weakTarget } : {}),
      shieldMs,
      returnsAt: now + (opts.travelMs ?? Math.round(RAID_TRAVEL_SECONDS * 1000 * ar.marchMultiplier)),
      ...(lootTotal(opts.carried) > 0 || (opts.carriedCoins ?? 0) > 0
        ? { carried: { ...emptyLoot(), ...opts.carried }, carriedCoins: opts.carriedCoins ?? 0 }
        : {}),
    },
  };
}

/** Step 3: survivors (and healed troops) march home with the loot. */
export function receiveRaidReport(
  s0: GameState,
  report: RaidReport,
  targetName: string,
  now: number,
  rand: number,
  from?: Point,
  hops = 0
) {
  const s = cloneState(s0);
  if (report.attackerXp) applyBattleXp(s, regimentWith(s, report.sent), report.attackerLosses, report.attackerXp);
  const units = survivorsOf(report.sent, report.attackerLosses);
  for (const u of UNIT_IDS) units[u] += report.attackerHealed[u];
  // A winner keeps the spoils it brought; a beaten army drops them on the field.
  const kept = report.attackerWon ? keptSpoils(report.carried, carryOf(survivorsOf(report.sent, report.attackerLosses))) : emptyLoot();
  const loot = emptyLoot();
  for (const r of RESOURCE_IDS) loot[r] = (report.loot[r] ?? 0) + kept[r];
  const coins = report.coins + (report.attackerWon ? (report.carriedCoins ?? 0) : 0);
  if (armySize(units) > 0) {
    s.marches.push({
      id: marchId(now, rand),
      target: targetName,
      units,
      loot,
      coins,
      returnsAt: report.returnsAt,
      leftAt: now,
      ...(from ? { from } : {}),
      ...(hops ? { hops } : {}),
    });
  }
  if (report.attackerWon) s.war.attacksWon += 1;
  else s.war.attacksLost += 1;
  s.war.resourcesLooted += RESOURCE_IDS.reduce((a, r) => a + report.loot[r], 0);
  return s;
}

// ─── Barbarian camps ─────────────────────────────────────────────────────────

export function campStatus(s: GameState, level: number, now: number) {
  const last = s.camps.lastRaid[level] ?? 0;
  if (level > s.camps.cleared + 1) return { state: "locked" as const, readyAt: 0 };
  if (level === s.camps.cleared + 1) return { state: "new" as const, readyAt: 0 };
  const readyAt = last + CAMP_REPEAT_COOLDOWN_MS;
  return { state: now >= readyAt ? ("ready" as const) : ("cooldown" as const), readyAt };
}

export function campReward(s: GameState, level: number) {
  const first = level > s.camps.cleared;
  const r = campFirstReward(level);
  const share = first ? 1 : CAMP_REPEAT_SHARE;
  return { resources: Math.round(r.resources * share), coins: Math.round(r.coins * share), first };
}

/** Troops leave for a barbarian camp. Checks the camp can be attacked now. */
export function dispatchCamp(s0: GameState, level: number, units: Army, now: number) {
  level = Math.floor(level);
  if (!isCampLevel(level)) throw new GameError("Unknown camp");
  const st = campStatus(s0, level, now);
  if (st.state === "locked") throw new GameError("Clear the previous camp first", "locked");
  if (st.state === "cooldown") throw new GameError("These barbarians are still regrouping", "cooldown");
  const s = cloneState(s0);
  const sent = validateSend(s, units);
  for (const u of UNIT_IDS) s.army[u] -= sent[u];
  return { state: s, sent, level };
}

/** The fight at a barbarian camp, once the army arrives. Survivors march home with the reward. */
export function campBattle(s0: GameState, level: number, sent: Army, now: number, rand: number, opts: MapOpts = {}) {
  const outcome = opts.outcome ?? campOutcome(s0, level, sent, rand, opts);
  return pveBattle(s0, sent, now, rand, opts, outcome, `Barbarian camp ${level}`, (s) => {
    const reward = campReward(s, level);
    if (reward.first) s.camps.cleared = Math.max(s.camps.cleared, level);
    s.camps.lastRaid[level] = now;
    return reward;
  });
}

// ─── Bandit lairs ────────────────────────────────────────────────────────────

/** Decides a fight at a bandit lair the moment the army arrives, without changing anything. */
export function lairOutcome(s: GameState, level: number, sent: Army, rand: number, opts: Pick<MapOpts, "terrain"> = {}) {
  const nums = battleNumbers(s, sent, null, opts.terrain, banditStrength(level));
  return resolve(nums.attack, nums.defense, luckFrom(rand), sent, emptyArmy(), getRates(s).healShare, 0);
}

/** Troops leave for a bandit lair. Lairs belong to nobody, so (like a camp) this doesn't end your shield. */
export function dispatchLair(s0: GameState, units: Army) {
  const s = cloneState(s0);
  const sent = validateSend(s, units);
  for (const u of UNIT_IDS) s.army[u] -= sent[u];
  return { state: s, sent };
}

/** The fight at a bandit lair. Winners march home with the bandits' hoard. */
export function lairBattle(s0: GameState, level: number, sent: Army, now: number, rand: number, opts: MapOpts = {}) {
  const outcome = opts.outcome ?? lairOutcome(s0, level, sent, rand, opts);
  return pveBattle(s0, sent, now, rand, opts, outcome, "Bandit lair", () => lairBounty(level));
}

/**
 * A fight against barbarians or bandits, applied to the attacker: XP, losses,
 * and the survivors' march home. `onWin` updates the state for a victory and
 * says what it brings home (each resource + coins).
 */
function pveBattle(
  s0: GameState,
  sent: Army,
  now: number,
  rand: number,
  opts: MapOpts,
  outcome: BattleOutcome,
  target: string,
  onWin: (s: GameState) => { resources: number; coins: number }
) {
  const s = cloneState(s0);
  const r = getRates(s);
  const attackerXp = battleXp(s, sent, outcome.defense, outcome.attackerWon, "attack");
  const attackerPromoted = applyBattleXp(s, regimentWith(s, sent), outcome.attackerLosses, attackerXp);
  const home = survivorsOf(sent, outcome.attackerLosses);
  for (const u of UNIT_IDS) home[u] += outcome.attackerHealed[u];

  const loot = emptyLoot();
  let coins = 0;
  // Spoils brought from an earlier battle come home only if this one is won.
  const kept = outcome.attackerWon ? keptSpoils(opts.carried, carryOf(survivorsOf(sent, outcome.attackerLosses))) : emptyLoot();
  if (outcome.attackerWon) {
    const reward = onWin(s);
    for (const res of RESOURCE_IDS) loot[res] = reward.resources;
    coins = reward.coins;
    s.war.attacksWon += 1;
    s.war.resourcesLooted += reward.resources * RESOURCE_IDS.length;
  } else {
    s.war.attacksLost += 1;
  }

  const returnsAt = now + (opts.travelMs ?? Math.round(CAMP_TRAVEL_SECONDS * 1000 * r.marchMultiplier));
  if (armySize(home) > 0) {
    s.marches.push({
      id: marchId(now, rand),
      target,
      units: home,
      loot: Object.fromEntries(RESOURCE_IDS.map((r) => [r, loot[r] + kept[r]])) as Loot,
      coins: coins + (outcome.attackerWon ? (opts.carriedCoins ?? 0) : 0),
      returnsAt,
      leftAt: now,
      ...(opts.from ? { from: opts.from } : {}),
      ...(opts.hops ? { hops: opts.hops } : {}),
    });
  }
  const report: RaidReport = {
    ...outcome,
    attackerXp,
    attackerPromoted,
    sent,
    defenders: emptyArmy(),
    loot,
    coins,
    returnsAt,
    ...(lootTotal(opts.carried) > 0 || (opts.carriedCoins ?? 0) > 0
      ? { carried: { ...emptyLoot(), ...opts.carried }, carriedCoins: opts.carriedCoins ?? 0 }
      : {}),
  };
  return { state: s, report };
}

/** Attack a barbarian camp and fight at once (no map). */
export function raidCamp(s0: GameState, level: number, units: Army, now: number, rand: number) {
  const d = dispatchCamp(s0, level, units, now);
  return campBattle(d.state, d.level, d.sent, now, rand);
}

/**
 * Troops that turned back before a battle walk home, with nothing or with the
 * spoils they already carried (`extra`, after new orders on the road).
 */
export function returnHome(
  s0: GameState,
  units: Army,
  target: string,
  returnsAt: number,
  now: number,
  rand: number,
  from?: Point,
  leftAt = now,
  extra: { loot?: Partial<Loot>; coins?: number; hops?: number } = {}
) {
  const s = cloneState(s0);
  if (armySize(units) > 0) {
    s.marches.push({
      id: marchId(now, rand),
      target,
      units: { ...units },
      loot: { ...emptyLoot(), ...extra.loot },
      coins: extra.coins ?? 0,
      returnsAt,
      leftAt,
      ...(from ? { from } : {}),
      ...(extra.hops ? { hops: extra.hops } : {}),
    });
  }
  return s;
}

// ─── New orders on the road ──────────────────────────────────────────────────

/** New orders one expedition can take: one, plus one per War Orders card level. */
export const maxOrders = (s: GameState) => REDIRECT.baseOrders + Math.min(REDIRECT.maxCardLevel, s.cards?.orders ?? 0);

/** Coins for the next War Orders card level, or null at the top. */
export const ordersCardCost = (s: GameState) => {
  const lvl = s.cards?.orders ?? 0;
  return lvl >= REDIRECT.maxCardLevel ? null : REDIRECT.cardCost[lvl];
};

/** Raises the War Orders card one level, for coins. */
export function buyOrdersCard(s0: GameState): GameState {
  const cost = ordersCardCost(s0);
  if (cost == null) throw new GameError("Your War Orders card is at its highest level", "max_level");
  if (s0.coins < cost) throw new GameError(`The War Orders card costs ${cost} coins`, "not_enough_coins");
  const s = cloneState(s0);
  s.coins -= cost;
  s.cards = { ...s.cards, orders: (s.cards?.orders ?? 0) + 1 };
  return s;
}

/**
 * Splits an army given new orders: `keep` (at most what it has) go on to the
 * new target and the rest walk home. An army can shrink but never grow.
 * Longships go where they're needed: with the troops going on when their road
 * (there, or home after the battle) crosses the sea, with the ones heading
 * home when theirs does; spare ships sail home.
 */
export function splitForRedirect(
  current: Army,
  keep: Army,
  ships: { go: boolean; back: boolean }
): { go: Army; back: Army } {
  const go = emptyArmy();
  const back = emptyArmy();
  for (const u of FIGHTERS) {
    const have = current[u] ?? 0;
    const n = Math.floor(Number(keep?.[u] ?? 0));
    if (!Number.isFinite(n) || n < 0) throw new GameError("Bad troop count");
    if (n > have) {
      throw new GameError(
        have === 0
          ? `This army has no ${UNIT_BY_ID[u].name}`
          : `This army only has ${have} ${UNIT_BY_ID[u].name}. New orders can't add troops.`,
        "not_enough_troops"
      );
    }
    go[u] = n;
    back[u] = have - n;
  }
  if (fighterCount(go) === 0) throw new GameError("Choose some troops to go on", "no_troops");
  const fleet = current[SHIP_ID] ?? 0;
  const forGo = ships.go ? shipsNeeded(go) : 0;
  const forBack = ships.back && fighterCount(back) > 0 ? shipsNeeded(back) : 0;
  if (forGo + forBack > fleet) {
    throw new GameError(
      forBack > 0
        ? `These roads cross the sea: ${forGo + forBack} Longships needed, this army has ${fleet}. Keep more troops together.`
        : `That road crosses the sea: ${forGo} Longships needed, this army has ${fleet}.`,
      "need_ships"
    );
  }
  go[SHIP_ID] = forGo;
  back[SHIP_ID] = fleet - forGo;
  return { go, back };
}

/**
 * Field supplies for new orders: a share of what the troops cost to train,
 * plus the crop they eat on the new road.
 */
export function redirectSupply(units: Army, legMs: number): Loot {
  const cost = emptyLoot();
  const hours = Math.max(0, legMs) / 3_600_000;
  for (const u of FIGHTERS) {
    const n = units[u] ?? 0;
    if (!n) continue;
    const def = UNIT_BY_ID[u];
    for (const r of RESOURCE_IDS) cost[r] += def.cost[r] * n * REDIRECT.supplyShare;
    cost.crop += def.upkeep * n * hours;
  }
  for (const r of RESOURCE_IDS) cost[r] = Math.ceil(cost[r]);
  return cost;
}

/** Pays `cost` out of `loot` as far as it goes; returns what's left and what's still owed. */
export function payFromLoot(loot: Partial<Loot>, cost: Loot): { loot: Loot; owed: Loot } {
  const left = { ...emptyLoot(), ...loot };
  const owed = emptyLoot();
  for (const r of RESOURCE_IDS) {
    const paid = Math.min(left[r], cost[r]);
    left[r] -= paid;
    owed[r] = cost[r] - paid;
  }
  return { loot: left, owed };
}

/**
 * Shares the spoils of a split army by how much each side can carry: the
 * troops heading home take their share (up to what they can carry).
 */
export function splitSpoils(loot: Partial<Loot>, coins: number, go: Army, back: Army) {
  const goLoot = { ...emptyLoot(), ...loot };
  const backLoot = emptyLoot();
  const cGo = carryOf(go);
  const cBack = carryOf(back);
  if (cBack <= 0) return { go: goLoot, back: backLoot, goCoins: coins, backCoins: 0 };
  const share = cBack / Math.max(1, cGo + cBack);
  let room = cBack;
  for (const r of RESOURCE_IDS) {
    const n = Math.min(room, Math.floor(goLoot[r] * share));
    backLoot[r] = n;
    goLoot[r] -= n;
    room -= n;
  }
  const backCoins = Math.floor(coins * share);
  return { go: goLoot, back: backLoot, goCoins: coins - backCoins, backCoins };
}

/** Takes what supplies the loot didn't cover from home storage. */
export function paySupplyFromHome(s0: GameState, owed: Loot): GameState {
  for (const r of RESOURCE_IDS) {
    if (s0.resources[r] < owed[r]) {
      throw new GameError(`Supplies for new orders need ${Math.ceil(owed[r])} more ${r} than the army carries or you have`, "not_enough_resources");
    }
  }
  const s = cloneState(s0);
  for (const r of RESOURCE_IDS) s.resources[r] -= owed[r];
  return s;
}

/** Can this expedition (having taken `hops` new orders) take another one? */
export function checkOrdersLeft(s: GameState, hops: number) {
  const max = maxOrders(s);
  if (hops >= max) {
    throw new GameError(
      (s.cards?.orders ?? 0) >= REDIRECT.maxCardLevel
        ? `This army already took ${max} new orders on this expedition`
        : `This army already took ${max === 1 ? "its new order" : `${max} new orders`}. Upgrade the War Orders card for more.`,
      "no_orders"
    );
  }
}

/** Throws if a camp can't be attacked right now (without changing anything). */
export function checkCamp(s: GameState, level: number, now: number) {
  if (!isCampLevel(level)) throw new GameError("Unknown camp");
  const st = campStatus(s, level, now);
  if (st.state === "locked") throw new GameError("Clear the previous camp first", "locked");
  if (st.state === "cooldown") throw new GameError("These barbarians are still regrouping", "cooldown");
}

/**
 * A tribe's defense as others see it, kept with every save so the map doesn't
 * have to load and advance every village's whole state. Defense only changes
 * in steps (a building finishing, an army coming home, a troop finishing
 * training) and, between them, with population, which grows at a steady
 * rate. So until the next step (`until`, null for none) `defenseAt` gives
 * exactly what `defensePower` of the advanced state would.
 */
export type DefenseSnapshot = {
  /** Troops and the Watchtower's flat defense. */
  troops: number;
  bonus: number;
  wall: number;
  /** Population at `at`, and its growth per hour. */
  pop: number;
  growth: number;
  at: number;
  until: number | null;
};

export function defenseSnapshot(s: GameState): DefenseSnapshot {
  const r = getRates(s);
  const troops = UNIT_IDS.reduce((sum, u) => sum + unitDefense(s, u) * s.army[u], 0);
  const steps = [
    ...s.queue.map((q) => q.endsAt),
    ...s.marches.map((m) => m.returnsAt),
    ...s.training.filter((t) => t.done < t.count).map((t) => t.startsAt + (t.done + 1) * t.perUnitMs),
  ];

  return {
    troops: troops + r.flatDefense,
    bonus: r.defenseBonus,
    wall: r.wallBonus,
    pop: s.population,
    growth: r.growthPerHour,
    at: s.updatedAt,
    until: steps.length ? Math.min(...steps) : null,
  };
}

/** Defense at `now`, from a snapshot still good then (now < until). Same sums as defensePower. */
export const defenseAt = (d: DefenseSnapshot, now: number) =>
  (d.troops + militiaDefense(d.pop + d.growth * (Math.max(0, now - d.at) / HOUR))) * (1 + d.bonus) * (1 + d.wall);

/** What the attacker sees about a target before attacking. */
export function scoutEstimate(target: GameState, attacker: GameState) {
  return scoutFromDefense(defensePower(target), attacker);
}

/** scoutEstimate from the target's defense (see defenseAt). */
export function scoutFromDefense(defense: number, attacker: GameState) {
  const exact = Math.round(defense);
  if (getRates(attacker).canScout) return { min: exact, max: exact, exact: true };
  // Without scouts you only learn the range it falls in (e.g. 512–1,024).
  const low = Math.pow(2, Math.floor(Math.log2(Math.max(1, exact))));
  return { min: low, max: low * 2, exact: false };
}
