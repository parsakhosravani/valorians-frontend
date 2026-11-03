import { SPY } from "./config";

/** When a Watchtower gets a chance at a spy (see SPY). */
export type SpyRoll = "plant" | "report" | "sweep";

/**
 * Chance (0–1) that a Watchtower at `watchtower` catches a spy sent from an
 * Exploration Center at `exploration`. Each side's levels push the odds
 * their way; no Watchtower catches nothing. A report roll is gentler: the
 * spy already got in once.
 */
export function spyCatchChance(watchtower: number, exploration: number, roll: SpyRoll = "plant"): number {
  if (watchtower <= 0) return 0;
  const contest = SPY.catchBase + SPY.catchPerLevel * (watchtower - exploration);
  const chance = Math.min(SPY.catchMax, Math.max(SPY.catchMin, contest));

  return roll === "report" ? chance * SPY.reportFactor : chance;
}

/** Whether a tribe's Watchtower is tall enough to count the spies inside and sweep for them. */
export const canSeeSpies = (watchtower: number) => watchtower >= SPY.seeLevel;
