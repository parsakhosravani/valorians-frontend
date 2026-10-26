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
  BATTLE_MIN_MS,
  BATTLE_MIN_ROUNDS,
  BATTLE_MS_PER_SQRT_TROOP,
  UNIT_BY_ID,
  UNIT_IDS,
} from "./config";
import { Army, emptyArmy } from "./engine";
import type { BattleOutcome } from "./war";

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
export function lossShares(outcome: Pick<BattleOutcome, "attackerWon" | "attack" | "defense">) {
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
export function planBattle(outcome: BattleOutcome, startedAt: number, troops: number, seed: number): BattlePlan {
  const duration = battleDurationMs(troops);
  const n = roundCount(duration);
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

/** Fighting troops in an army (ships wait offshore and don't count). */
export const troopsOnField = (army: Army) =>
  UNIT_IDS.reduce((n, u) => n + (UNIT_BY_ID[u].transport ? 0 : (army[u] ?? 0)), 0);
