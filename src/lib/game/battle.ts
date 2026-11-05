/**
 * Timed battles. When an army reaches its target the fight is decided at once
 * (so nobody can change it afterwards), then played out over several rounds:
 * troops fall round by round and the result is only known when the last one
 * ends. The length grows with the number of troops on the field.
 *
 * Pure functions: the server supplies time and randomness.
 */
import {
  BATTLE_MAX_MS,
  BATTLE_MAX_ROUNDS,
  BATTLE_MAX_ROUNDS_REINFORCED,
  BATTLE_MIN_MS,
  BATTLE_MIN_ROUNDS,
  BATTLE_MS_PER_SQRT_TROOP,
  EMPTY_VILLAGE_DEFENSE_PER_TROOP,
  UNIT_BY_ID,
  UNIT_IDS,
} from "./config";
import { Army, GameState, cloneState, emptyArmy, getRates } from "./engine";
import type { Terrain } from "./map";
import { BattleOutcome, battleNumbers, fightersOf, resolve } from "./war";

export type BattleRound = {
  /** 1-based round number. */
  n: number;
  /** When the round ends, in ms after the battle began. */
  at: number;
  /** Troops of each side that have fallen so far (killed or wounded), cumulative. */
  attackerFallen: Army;
  defenderFallen: Army;
  /** Share of each side's strength still standing after this round, 0–1. */
  attackLeft: number;
  defenseLeft: number;
  /** Defenders who came home and joined the fight at the start of this round. */
  joined?: Army;
  /** Attackers who arrived (your own second army, or a clanmate's) and joined at the start of this round. */
  allied?: Army;
};

export type BattlePlan = {
  startedAt: number;
  endsAt: number;
  rounds: BattleRound[];
};

/** How long a battle with this many troops on the field (both sides) lasts. */
export function battleDurationMs(troops: number) {
  const ms = Math.round(BATTLE_MS_PER_SQRT_TROOP * Math.sqrt(Math.max(0, troops)));

  return Math.min(BATTLE_MAX_MS, Math.max(BATTLE_MIN_MS, ms));
}

/** Rounds in a battle of this length: about one a minute, 3 to 10. */
export function roundCount(durationMs: number) {
  const n = Math.round(durationMs / 60_000) + 2;

  return Math.min(BATTLE_MAX_ROUNDS, Math.max(BATTLE_MIN_ROUNDS, n));
}

/** Small seeded generator so a battle always plays out the same way. */
function seeded(seed: number) {
  let a = Math.floor(seed * 4294967296) >>> 0 || 0x9e3779b9;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How much of a side's final losses have happened by the end of each round
 * (0–1, rising, last = 1). The winner bleeds steadily; the loser holds on,
 * then breaks in the last rounds.
 */
function curve(rounds: number, won: boolean, next: () => number) {
  const shape = won ? 1 : 1.8;
  const steps: number[] = [];

  for (let k = 1; k <= rounds; k++) {
    const base = Math.pow(k / rounds, shape) - Math.pow((k - 1) / rounds, shape);

    steps.push(base * (0.65 + 0.7 * next()));
  }
  const total = steps.reduce((a, b) => a + b, 0) || 1;
  let sum = 0;

  return steps.map((s, i) => (i === rounds - 1 ? 1 : (sum += s) / total));
}

const fallenOf = (losses: Army, healed: Army) => {
  const out = emptyArmy();

  for (const u of UNIT_IDS) out[u] = (losses[u] ?? 0) + (healed[u] ?? 0);

  return out;
};

const scale = (army: Army, f: number) => {
  const out = emptyArmy();

  for (const u of UNIT_IDS) out[u] = Math.round((army[u] ?? 0) * f);

  return out;
};

/** Share of each side's strength lost by the end, from the decided battle. */
function lossShares(outcome: Pick<BattleOutcome, "attackerWon" | "attack" | "defense">) {
  const a = Math.max(1, outcome.attack);
  const d = Math.max(1, outcome.defense);

  return outcome.attackerWon
    ? { attacker: Math.min(1, Math.pow(d / a, 1.5)), defender: 1 }
    : { attacker: 1, defender: Math.min(1, Math.pow(a / d, 1.5)) };
}

/**
 * Lays out a decided battle as rounds. `troops` is everyone on the field
 * (both sides), which sets how long it lasts. `seed` in [0,1).
 */
export function planBattle(
  outcome: BattleOutcome,
  startedAt: number,
  troops: number,
  seed: number,
  maxRounds = BATTLE_MAX_ROUNDS
): BattlePlan {
  const duration = battleDurationMs(troops);
  const n = Math.max(1, Math.min(maxRounds, roundCount(duration)));
  const next = seeded(seed);
  const atkCurve = curve(n, outcome.attackerWon, next);
  const defCurve = curve(n, !outcome.attackerWon, next);
  const atkFallen = fallenOf(outcome.attackerLosses, outcome.attackerHealed);
  const defFallen = fallenOf(outcome.defenderLosses, outcome.defenderHealed);
  const shares = lossShares(outcome);
  const rounds: BattleRound[] = [];

  for (let i = 0; i < n; i++) {
    rounds.push({
      n: i + 1,
      at: Math.round((duration * (i + 1)) / n),
      attackerFallen: i === n - 1 ? atkFallen : scale(atkFallen, atkCurve[i]),
      defenderFallen: i === n - 1 ? defFallen : scale(defFallen, defCurve[i]),
      attackLeft: round2(1 - shares.attacker * atkCurve[i]),
      defenseLeft: round2(1 - shares.defender * defCurve[i]),
    });
  }

  return { startedAt, endsAt: startedAt + duration, rounds };
}

const round2 = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100) / 100;

/** The rounds already fought by `now` (the rest stay secret until they happen). */
export const roundsSoFar = (plan: BattlePlan, now: number) => plan.rounds.filter((r) => plan.startedAt + r.at <= now);

/** When the next round ends, or null once the battle is over. */
export const nextRoundAt = (plan: BattlePlan, now: number) => {
  const r = plan.rounds.find((x) => plan.startedAt + x.at > now);

  return r ? plan.startedAt + r.at : null;
};

/**
 * How many fighters a battle counts, for how long it lasts: twice the smaller
 * side. A great army storming an empty village, or a handful raiding a camp,
 * is over in a few rounds; only two big armies fight for long. `defenders`
 * is troops or, for a village with few or none, its defense in troop terms.
 */
export const battleSize = (attackers: number, defenders: number) => 2 * Math.max(0, Math.min(attackers, defenders));

/** Fighting troops in an army (ships wait offshore and don't count). */
export const troopsOnField = (army: Army) =>
  UNIT_IDS.reduce((n, u) => n + (UNIT_BY_ID[u].transport ? 0 : (army[u] ?? 0)), 0);

// ─── Armies coming home into a battle ───────────────────────────────────────

/** A battle under way, as the server keeps it. `engaged` is null at a camp or lair. */
export type FieldBattle = { plan: BattlePlan; outcome: BattleOutcome; engaged: Army | null };

/**
 * The last moment an army coming home can still join: before the last round
 * begins. Later, it waits at home for the result.
 */
export const joinDeadline = (plan: BattlePlan) =>
  plan.rounds.length >= 2 ? plan.startedAt + plan.rounds[plan.rounds.length - 2].at - 1 : plan.startedAt - 1;

const plus = (a: Army, b: Army) => {
  const out = emptyArmy();

  for (const u of UNIT_IDS) out[u] = (a[u] ?? 0) + (b[u] ?? 0);

  return out;
};

const minus = (a: Army, b: Army) => {
  const out = emptyArmy();

  for (const u of UNIT_IDS) out[u] = Math.max(0, (a[u] ?? 0) - (b[u] ?? 0));

  return out;
};

/** Splits troops fallen so far into dead and wounded, in the battle's own proportion. */
function splitFallen(fallen: Army, losses: Army, healed: Army) {
  const dead = emptyArmy();
  const hurt = emptyArmy();

  for (const u of UNIT_IDS) {
    const l = losses[u] ?? 0;
    const total = l + (healed[u] ?? 0);

    dead[u] = total > 0 ? Math.round(((fallen[u] ?? 0) * l) / total) : (fallen[u] ?? 0);
    hurt[u] = (fallen[u] ?? 0) - dead[u];
  }

  return { dead, hurt };
}

/**
 * An army came home at `join.at` while its village was fighting. The round
 * under way is fought out as it was; the soldiers take the field at the
 * start of the next one, and the rest of the battle is decided again: the
 * attackers still standing against the defenders still standing plus the
 * newcomers, with the same luck, walls and terrain. Rounds already fought
 * never change. Returns null when it's too late to join (the last round has
 * begun, or the battle has as many rounds as it may have).
 */
export function reinforceBattle(
  defender: GameState,
  attacker: GameState,
  sent: Army,
  battle: FieldBattle,
  join: { at: number; units: Army },
  seed: number,
  opts: { terrain?: Terrain; landing?: boolean } = {}
): FieldBattle | null {
  return regroup("defense", defender, attacker, sent, battle, join, seed, opts);
}

/**
 * The other side: an army of the attackers' side (the same tribe's second
 * army, or a clanmate's) reached a village that is fighting them. Instead of
 * waiting at the gates for its own battle, it joins this one at the start of
 * the next round, under the leading army's banner (its bonuses, like guards
 * fight under their host's). `sent` is every attacker who has taken the field
 * so far. Same rules as reinforceBattle; null when it's too late to join.
 */
export function reinforceAttack(
  defender: GameState,
  attacker: GameState,
  sent: Army,
  battle: FieldBattle,
  join: { at: number; units: Army },
  seed: number,
  opts: { terrain?: Terrain; landing?: boolean } = {}
): FieldBattle | null {
  return regroup("attack", defender, attacker, sent, battle, join, seed, opts);
}

function regroup(
  side: "attack" | "defense",
  defender: GameState,
  attacker: GameState,
  sent: Army,
  battle: FieldBattle,
  join: { at: number; units: Army },
  seed: number,
  opts: { terrain?: Terrain; landing?: boolean }
): FieldBattle | null {
  const { plan, outcome } = battle;
  const fresh = fightersOf(join.units);

  if (troopsOnField(fresh) === 0) return null;
  const ended = plan.rounds.filter((r) => plan.startedAt + r.at <= join.at).length;
  const keep = ended + 1; // the round under way when they arrived

  if (keep >= plan.rounds.length || keep + BATTLE_MIN_ROUNDS > BATTLE_MAX_ROUNDS_REINFORCED) return null;

  const base = plan.rounds[keep - 1];
  const engaged = battle.engaged ?? emptyArmy();
  const trapped = outcome.attackerTrapped ?? emptyArmy();
  // Who has fallen when the newcomers arrive (trapped attackers fell before the first round).
  const atkFallen = emptyArmy();
  const defFallen = emptyArmy();

  for (const u of UNIT_IDS) {
    atkFallen[u] = Math.min(sent[u] ?? 0, Math.max(base.attackerFallen[u] ?? 0, trapped[u] ?? 0));
    defFallen[u] = Math.min(engaged[u] ?? 0, base.defenderFallen[u] ?? 0);
  }
  const atkSoFar = splitFallen(atkFallen, outcome.attackerLosses, outcome.attackerHealed);
  const defSoFar = splitFallen(defFallen, outcome.defenderLosses, outcome.defenderHealed);
  const attacking = side === "attack";
  const atkLeft = attacking ? plus(minus(sent, atkFallen), fresh) : minus(sent, atkFallen);
  const defLeft = attacking ? minus(engaged, defFallen) : plus(minus(engaged, defFallen), fresh);

  // The rest of the fight, from where it stands.
  const field = cloneState(defender);

  field.army = defLeft;
  const nums = battleNumbers(attacker, atkLeft, field, opts.terrain, 0, opts.landing);
  const rest = resolve(
    nums.attack,
    nums.defense,
    outcome.luck,
    atkLeft,
    defLeft,
    getRates(attacker).healShare,
    getRates(defender).healShare
  );
  const merged: BattleOutcome = {
    ...outcome,
    attackerWon: rest.attackerWon,
    attack: rest.attack,
    defense: rest.defense,
    attackerLosses: plus(atkSoFar.dead, rest.attackerLosses),
    attackerHealed: plus(atkSoFar.hurt, rest.attackerHealed),
    defenderLosses: plus(defSoFar.dead, rest.defenderLosses),
    defenderHealed: plus(defSoFar.hurt, rest.defenderHealed),
  };

  const defenders = troopsOnField(defLeft);
  const sub = planBattle(
    rest,
    0,
    battleSize(troopsOnField(atkLeft), defenders > 0 ? defenders : Math.round(rest.defense / EMPTY_VILLAGE_DEFENSE_PER_TROOP)),
    seed,
    BATTLE_MAX_ROUNDS_REINFORCED - keep
  );
  // The joining side's bar fills back up by the newcomers' share of that side.
  const before = troopsOnField(attacking ? minus(sent, atkFallen) : minus(engaged, defFallen));
  const came = troopsOnField(fresh);
  const was = attacking ? base.attackLeft : base.defenseLeft;
  const lift = before + came > 0 ? (was * before + came) / (before + came) : 1;
  const rounds: BattleRound[] = [
    ...plan.rounds.slice(0, keep),
    ...sub.rounds.map((r, i) => ({
      n: keep + i + 1,
      at: base.at + r.at,
      attackerFallen: plus(atkFallen, r.attackerFallen),
      defenderFallen: plus(defFallen, r.defenderFallen),
      attackLeft: round2((attacking ? lift : base.attackLeft) * r.attackLeft),
      defenseLeft: round2((attacking ? base.defenseLeft : lift) * r.defenseLeft),
      ...(i === 0 ? (attacking ? { allied: fresh } : { joined: fresh }) : {}),
    })),
  ];

  return {
    plan: { startedAt: plan.startedAt, endsAt: plan.startedAt + rounds[rounds.length - 1].at, rounds },
    outcome: merged,
    engaged: attacking ? engaged : plus(engaged, fresh),
  };
}

/** The defenders on the field by `now`: newcomers count once their round has begun. */
export function defendersSoFar(plan: BattlePlan, engaged: Army | null, now: number): Army | null {
  if (!engaged) return null;
  let out = { ...engaged };

  plan.rounds.forEach((r, i) => {
    const from = plan.startedAt + (i > 0 ? plan.rounds[i - 1].at : 0);

    if (r.joined && from > now) out = minus(out, r.joined);
  });

  return out;
}
