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
  LUCK,
  MAX_BATCH,
  MAX_CAMP_LEVEL,
  MAX_LOOT_SHARE,
  MAX_TRAIN_BATCHES,
  RAIDED_SHIELD_MS,
  RAID_TRAVEL_SECONDS,
  RAM_WALL_BREAK,
  RESOURCE_IDS,
  ResourceId,
  UNITS,
  UNIT_BY_ID,
  UNIT_IDS,
  UnitId,
  campDefense,
  campFirstReward,
  militiaDefense,
} from "./config";
import {
  Army,
  GameError,
  GameState,
  cloneState,
  emptyArmy,
  getRates,
  totalArmy,
  trainingEndsAt,
} from "./engine";

const emptyLoot = (): Record<ResourceId, number> => ({ iron: 0, wood: 0, clay: 0, crop: 0 });

export const armySize = (a: Army) => UNIT_IDS.reduce((n, u) => n + (a[u] ?? 0), 0);

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
  if (s0.training.length >= MAX_TRAIN_BATCHES) throw new GameError("Training queue is full", "queue_full");

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

// ─── Battle maths ────────────────────────────────────────────────────────────

export function attackPower(s: GameState, units: Army) {
  const raw = UNITS.reduce((sum, u) => sum + u.attack * (units[u.id] ?? 0), 0);
  return raw * (1 + getRates(s).attackBonus);
}

/** Defense of a tribe against an attack bringing `rams` battering rams. */
export function defensePower(s: GameState, rams = 0) {
  const r = getRates(s);
  const troops = UNITS.reduce((sum, u) => sum + u.defense * s.army[u.id], 0);
  const wall = r.wallBonus * Math.max(0, 1 - rams * RAM_WALL_BREAK);
  return (troops + r.flatDefense + militiaDefense(s.population)) * (1 + r.defenseBonus) * (1 + wall);
}

export function powerScore(s: GameState) {
  const army = totalArmy(s);
  const troops = UNITS.reduce((sum, u) => sum + ((u.attack + u.defense) / 2) * army[u.id], 0);
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
};

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

  const lose = (army: Army, share: number, heal: number) => {
    const losses = emptyArmy();
    const healed = emptyArmy();
    for (const u of UNIT_IDS) {
      const dead = Math.min(army[u], Math.round(army[u] * share));
      healed[u] = Math.floor(dead * heal);
      losses[u] = dead - healed[u];
    }
    return { losses, healed };
  };
  const at = lose(sent, attackerShare, attackerHeal);
  const df = lose(defenders, defenderShare, defenderHeal);
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
  if (armySize(clean) === 0) throw new GameError("Choose some troops to send", "no_troops");
  return clean;
}

const carryOf = (units: Army) => UNITS.reduce((sum, u) => sum + u.carry * units[u.id], 0);

const survivorsOf = (sent: Army, losses: Army) => {
  const out = emptyArmy();
  for (const u of UNIT_IDS) out[u] = sent[u] - losses[u];
  return out;
};

const marchId = (now: number, rand: number) => `${now.toString(36)}${Math.floor(rand * 1e6).toString(36)}`;

// ─── Raids on other players ──────────────────────────────────────────────────

/** Step 1: troops leave home. Attacking ends your own new-player shield. */
export function dispatchRaid(s0: GameState, units: Army, now: number) {
  const s = cloneState(s0);
  const sent = validateSend(s, units);
  for (const u of UNIT_IDS) s.army[u] -= sent[u];
  s.shieldUntil = Math.min(s.shieldUntil, now);
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
};

/**
 * Step 2: the battle, applied to the defender. Returns the defender's new
 * state and the report the attacker needs.
 */
export function defendRaid(
  defender0: GameState,
  attacker: GameState,
  sent: Army,
  now: number,
  rand: number
): { state: GameState; report: RaidReport } {
  if (defender0.shieldUntil > now) throw new GameError("This tribe is protected by a shield right now", "shielded");
  const d = cloneState(defender0);
  const ar = getRates(attacker);
  const dr = getRates(d);

  const defenders = { ...d.army };
  const outcome = resolve(
    attackPower(attacker, sent),
    defensePower(d, sent.ram),
    luckFrom(rand),
    sent,
    defenders,
    ar.healShare,
    dr.healShare
  );

  // Healed defenders recover at home straight away, so only real losses go.
  for (const u of UNIT_IDS) d.army[u] -= outcome.defenderLosses[u];

  const loot = emptyLoot();
  if (outcome.attackerWon) {
    const survivors = survivorsOf(sent, outcome.attackerLosses);
    let carry = carryOf(survivors);
    const available = RESOURCE_IDS.map((r) => Math.max(0, d.resources[r] - dr.hidden) * MAX_LOOT_SHARE);
    const total = available.reduce((a, b) => a + b, 0);
    if (total > 0 && carry > 0) {
      const take = Math.min(1, carry / total);
      RESOURCE_IDS.forEach((r, i) => {
        loot[r] = Math.floor(available[i] * take);
        d.resources[r] -= loot[r];
      });
    }
    d.war.defensesLost += 1;
  } else {
    d.war.defensesWon += 1;
  }
  d.shieldUntil = now + RAIDED_SHIELD_MS;

  return {
    state: d,
    report: {
      ...outcome,
      sent,
      defenders,
      loot,
      coins: 0,
      returnsAt: now + Math.round(RAID_TRAVEL_SECONDS * 1000 * ar.marchMultiplier),
    },
  };
}

/** Step 3: survivors (and healed troops) march home with the loot. */
export function receiveRaidReport(s0: GameState, report: RaidReport, targetName: string, now: number, rand: number) {
  const s = cloneState(s0);
  const units = survivorsOf(report.sent, report.attackerLosses);
  for (const u of UNIT_IDS) units[u] += report.attackerHealed[u];
  if (armySize(units) > 0) {
    s.marches.push({
      id: marchId(now, rand),
      target: targetName,
      units,
      loot: report.loot,
      coins: report.coins,
      returnsAt: report.returnsAt,
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

/** Attack a barbarian camp. Resolved at once; troops come home with the reward. */
export function raidCamp(s0: GameState, level: number, units: Army, now: number, rand: number) {
  level = Math.floor(level);
  if (!(level >= 1 && level <= MAX_CAMP_LEVEL)) throw new GameError("Unknown camp");
  const st = campStatus(s0, level, now);
  if (st.state === "locked") throw new GameError("Clear the previous camp first", "locked");
  if (st.state === "cooldown") throw new GameError("These barbarians are still regrouping", "cooldown");

  const s = cloneState(s0);
  const sent = validateSend(s, units);
  const r = getRates(s);
  const outcome = resolve(attackPower(s, sent), campDefense(level), luckFrom(rand), sent, emptyArmy(), r.healShare, 0);

  for (const u of UNIT_IDS) s.army[u] -= sent[u];
  const home = survivorsOf(sent, outcome.attackerLosses);
  for (const u of UNIT_IDS) home[u] += outcome.attackerHealed[u];

  const loot = emptyLoot();
  let coins = 0;
  if (outcome.attackerWon) {
    const reward = campReward(s, level);
    for (const res of RESOURCE_IDS) loot[res] = reward.resources;
    coins = reward.coins;
    if (reward.first) s.camps.cleared = level;
    s.camps.lastRaid[level] = now;
    s.war.attacksWon += 1;
    s.war.resourcesLooted += reward.resources * RESOURCE_IDS.length;
  } else {
    s.war.attacksLost += 1;
  }

  const returnsAt = now + Math.round(CAMP_TRAVEL_SECONDS * 1000 * r.marchMultiplier);
  if (armySize(home) > 0) {
    s.marches.push({ id: marchId(now, rand), target: `Barbarian camp ${level}`, units: home, loot, coins, returnsAt });
  }
  const report: RaidReport = { ...outcome, sent, defenders: emptyArmy(), loot, coins, returnsAt };
  return { state: s, report };
}

/** What the attacker sees about a target before attacking. */
export function scoutEstimate(target: GameState, attacker: GameState) {
  const exact = Math.round(defensePower(target));
  if (getRates(attacker).canScout) return { min: exact, max: exact, exact: true };
  // Without scouts you only learn the range it falls in (e.g. 512–1,024).
  const low = Math.pow(2, Math.floor(Math.log2(Math.max(1, exact))));
  return { min: low, max: low * 2, exact: false };
}
