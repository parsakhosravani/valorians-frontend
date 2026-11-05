/**
 * Clans fighting together: reinforcements, weekly goals and treaties. Pure
 * rules shared by the server and the client (see CLAN_WAR for the numbers,
 * src/server/clanWar.ts for the server side).
 */
import { CLAN_WAR, UNIT_BY_ID, UNIT_IDS } from "./config";
import { Abroad, Army, GameError, GameState, Guest, cloneState, emptyArmy } from "./engine";
import { embark, fighterCount, validateSend } from "./war";

// ─── Reinforcements ──────────────────────────────────────────────────────────

/**
 * Troops leave home to guard a clanmate. The dragon stays (it never leaves its
 * Roost except to strike); across the sea the Longships they need sail along.
 */
export function dispatchSupport(s0: GameState, units: Army, naval: boolean, entry: Omit<Abroad, "units">) {
  if ((s0.abroad ?? []).length >= CLAN_WAR.maxSupportsOut) {
    throw new GameError(`You can have ${CLAN_WAR.maxSupportsOut} groups guarding clanmates at once. Call one home first.`, "too_many");
  }
  const picked = validateSend(s0, { ...emptyArmy(), ...units });

  for (const u of UNIT_IDS) if (UNIT_BY_ID[u].maxOwned && picked[u] > 0) throw new GameError("Your dragon guards only its own Roost", "no_dragon");
  const sent = embark(s0, picked, naval);
  const s = cloneState(s0);

  for (const u of UNIT_IDS) s.army[u] -= sent[u];
  s.abroad = [...(s.abroad ?? []), { ...entry, units: sent }];

  return { state: s, sent };
}

/** Guards arrive: they stand in the village's army, and the ledger says whose they are. */
export function receiveGuest(s0: GameState, guest: Guest): GameState {
  const s = cloneState(s0);

  if ((s.guests ?? []).length >= CLAN_WAR.maxGuestsIn && !s.guests?.some((g) => g.id === guest.id)) {
    throw new GameError(`A village can host guards from ${CLAN_WAR.maxGuestsIn} clanmates at once`, "too_many_guests");
  }
  for (const u of UNIT_IDS) s.army[u] += guest.units[u] ?? 0;
  s.guests = [...(s.guests ?? []).filter((g) => g.id !== guest.id), { ...guest, units: { ...emptyArmy(), ...guest.units } }];

  return s;
}

/**
 * Guards leave the village (called home, or sent away). Refused mid-battle:
 * they're out on the field. Returns the troops that leave.
 */
export function releaseGuest(s0: GameState, id: number): { state: GameState; units: Army } {
  const g = (s0.guests ?? []).find((x) => x.id === id);

  if (!g) return { state: s0, units: emptyArmy() };
  if (s0.defending?.length) throw new GameError("The village is fighting: its guards can't leave until the battle ends", "fighting");
  const s = cloneState(s0);
  const units = emptyArmy();

  for (const u of UNIT_IDS) {
    units[u] = Math.max(0, Math.min(g.units[u] ?? 0, s.army[u]));
    s.army[u] -= units[u];
  }
  s.guests = (s.guests ?? []).filter((x) => x.id !== id);

  return { state: s, units };
}

/** The owner's record of troops guarding a clanmate: updated (losses, arrival) or dropped. */
export function updateAbroad(s0: GameState, id: number, patch: Partial<Abroad> | null): GameState {
  const s = cloneState(s0);

  s.abroad = (s.abroad ?? []).flatMap((a) => (a.id !== id ? [a] : patch ? [{ ...a, ...patch, units: { ...(patch.units ?? a.units) } }] : []));

  return s;
}

export const hasTroops = (a: Army) => fighterCount(a) > 0 || UNIT_IDS.some((u) => (a[u] ?? 0) > 0);

// ─── Weekly goal ─────────────────────────────────────────────────────────────

export const GOAL_KINDS = ["camps", "wins", "donated"] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const GOAL_TEXT: Record<GoalKind, { icon: string; title: string; unit: string }> = {
  camps: { icon: "🏕️", title: "Clear barbarian camps and bandit lairs", unit: "camps" },
  wins: { icon: "⚔️", title: "Win battles against other tribes", unit: "victories" },
  donated: { icon: "💰", title: "Fill the treasury", unit: "donated" },
};

const WEEK = 7 * 24 * 3600e3;
/** 1 Jan 1970 was a Thursday: shift so weeks start on Monday 00:00 UTC. */
const MONDAY = 4 * 24 * 3600e3;

/** The week number `now` falls in (Monday to Sunday, UTC). */
export const weekOf = (now: number) => Math.floor((now - MONDAY) / WEEK);
/** When week `w` ends (next Monday 00:00 UTC). */
export const weekEnds = (w: number) => (w + 1) * WEEK + MONDAY;

/** This week's goal for a clan of `members`: the kind rotates week by week. */
export function weeklyGoal(week: number, members: number) {
  const kind = GOAL_KINDS[((week % GOAL_KINDS.length) + GOAL_KINDS.length) % GOAL_KINDS.length];

  return { kind, target: Math.max(1, members) * CLAN_WAR.weeklyPerMember[kind], coins: CLAN_WAR.weeklyCoins };
}

// ─── Diplomacy ───────────────────────────────────────────────────────────────

export type RelationKind = "ally" | "nap" | "war";

export const RELATION_TEXT: Record<RelationKind, { icon: string; name: string; hint: string }> = {
  ally: { icon: "🤝", name: "Alliance", hint: "Can't raid each other. Both clans must agree." },
  nap: { icon: "🕊️", name: "Non-aggression pact", hint: "Can't raid each other. Both clans must agree." },
  war: { icon: "🔥", name: "War", hint: "Declared by one clan. Raid wins between you score war points." },
};

/** Treaties that stop raids between the two clans' members. */
export const blocksRaids = (kind: RelationKind | null | undefined) => kind === "ally" || kind === "nap";

/** The same pair of clans always as (smaller id, larger id), so one row holds their relation. */
export const pairOf = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);
