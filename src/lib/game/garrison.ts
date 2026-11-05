/**
 * Outpost garrisons (see OUTPOST.garrisonBase): troops stationed at an outpost.
 * They march there from home (and back) like any army, attack from there (the
 * road is shorter), and come back there. They don't defend the home village;
 * a garrisoned outpost can be attacked, and only its garrison defends it.
 *
 * Pure functions: the server supplies time, travel times and randomness.
 */
import { OUTPOST, UNIT_BY_ID, UNIT_IDS } from "./config";
import { Army, GameError, GameState, Outpost, cloneState, emptyArmy, ownArmy, totalArmy } from "./engine";
import { BattleOutcome, Loot, RaidReport, applyBattleXp, armySize, battleXp, marchId } from "./war";

/** How many troops an outpost can hold: more as its fields grow. */
export function garrisonCap(o: Outpost): number {
  const levels = Object.values(o.fields ?? {}).reduce((n, l) => n + (l ?? 0), 0);

  return OUTPOST.garrisonBase + OUTPOST.garrisonPerFieldLevel * levels;
}

/** Troops stationed at an outpost now. */
export const garrisonOf = (o: Outpost | undefined): Army => ({ ...emptyArmy(), ...o?.garrison });

/** Troops on their way to outpost `idx` (they'll take room there). */
export function headingTo(s: GameState, idx: number): Army {
  const a = emptyArmy();

  for (const m of s.marches) if (m.to === idx) for (const u of UNIT_IDS) a[u] += m.units[u] ?? 0;

  return a;
}

/** Room left at outpost `idx`, counting troops already on the way. */
export const garrisonRoom = (s: GameState, idx: number) => {
  const o = s.outposts?.[idx];

  return o ? Math.max(0, garrisonCap(o) - armySize(garrisonOf(o)) - armySize(headingTo(s, idx))) : 0;
};

const outpostAt = (s: GameState, idx: number) => {
  const i = Math.floor(Number(idx));
  const o = Number.isInteger(i) && i >= 0 ? s.outposts?.[i] : undefined;

  if (!o) throw new GameError("No such outpost", "not_found");

  return { i, o };
};

/** Whole, non-negative troop counts, never more than `have`; ships can't march overland. */
function pick(units: Army, have: Army, where: string): Army {
  const clean = emptyArmy();

  for (const u of UNIT_IDS) {
    const n = Math.floor(Number(units?.[u] ?? 0));

    if (!Number.isFinite(n) || n < 0) throw new GameError("Bad troop count");
    if (n === 0) continue;
    if (UNIT_BY_ID[u].transport) throw new GameError("Ships stay in the harbor at home", "ships");
    if (n > (have[u] ?? 0)) throw new GameError(`You only have ${have[u] ?? 0} ${UNIT_BY_ID[u].name} ${where}`, "not_enough_troops");
    clean[u] = n;
  }
  if (armySize(clean) === 0) throw new GameError("Choose some troops", "no_troops");

  return clean;
}

/**
 * Troops leave home for outpost `idx`; they join its garrison when they get
 * there (`travelMs` later). Once on the road they can't be called back.
 */
export function sendToOutpost(s0: GameState, idx: number, units: Army, travelMs: number, from: { x: number; y: number }, now: number, rand: number) {
  const { i } = outpostAt(s0, idx);
  const sent = pick(units, ownArmy(s0), "of your own at home");

  if (sent.dragon && (s0.dragonRestUntil ?? 0) > now) throw new GameError("Your dragon is wounded and resting. It can fly again soon.", "dragon_resting");
  const room = garrisonRoom(s0, i);

  if (armySize(sent) > room) throw new GameError(`This outpost has room for ${room} more troops`, "garrison_full");
  const s = cloneState(s0);

  for (const u of UNIT_IDS) s.army[u] -= sent[u];
  s.marches.push({
    id: marchId(now, rand),
    target: `Outpost ${i + 1}`,
    units: sent,
    loot: { iron: 0, wood: 0, clay: 0, crop: 0 },
    coins: 0,
    returnsAt: now + Math.max(1000, Math.round(travelMs)),
    leftAt: now,
    from: { x: from.x, y: from.y },
    to: i,
  });

  return { state: s, sent };
}

/** Troops of outpost `idx`'s garrison march home (`travelMs`). */
export function leaveOutpost(s0: GameState, idx: number, units: Army, travelMs: number, now: number, rand: number) {
  const { i, o } = outpostAt(s0, idx);
  const sent = pick(units, garrisonOf(o), "at this outpost");
  const s = cloneState(s0);
  const g = garrisonOf(s.outposts[i]);

  for (const u of UNIT_IDS) g[u] -= sent[u];
  s.outposts[i].garrison = g;
  s.marches.push({
    id: marchId(now, rand),
    target: `Outpost ${i + 1}`,
    units: sent,
    loot: { iron: 0, wood: 0, clay: 0, crop: 0 },
    coins: 0,
    returnsAt: now + Math.max(1000, Math.round(travelMs)),
    leftAt: now,
    from: { x: o.x, y: o.y },
  });

  return { state: s, sent };
}

/**
 * Runs an army action (sending an attack, say) on outpost `idx`'s garrison
 * instead of the troops at home: `fn` sees the garrison as the army, and
 * whatever it takes comes out of the garrison. Guards from clanmates stay at
 * home, out of it.
 */
export function withGarrison<R extends { state: GameState }>(s0: GameState, idx: number, fn: (s: GameState) => R): R {
  const { i } = outpostAt(s0, idx);
  const s = cloneState(s0);
  const home = s.army;
  const guests = s.guests;

  s.army = garrisonOf(s.outposts[i]);
  s.guests = [];
  const r = fn(s);
  const out = cloneState(r.state);

  out.outposts[i].garrison = out.army;
  out.army = home;
  out.guests = guests;

  return { ...r, state: out };
}

/**
 * The outpost as a battlefield: only its garrison, on open ground. No walls,
 * Watchtower, traps or militia (those stand at home); the troops' own
 * training (Smithy and the like) still counts.
 */
export function outpostField(s0: GameState, idx: number): GameState {
  const { o } = outpostAt(s0, idx);
  const s = cloneState(s0);

  s.army = garrisonOf(o);
  s.guests = [];
  s.population = 0;
  for (const b of ["city-gate", "watchtower", "trapmaker", "harbor"] as const) s.buildings[b] = 0;

  return s;
}

/** The garrison leaves for the field when the battle starts (it comes back, less its losses, at the end). */
export function engageGarrison(s0: GameState, idx: number, engaged: Army): GameState {
  const { i } = outpostAt(s0, idx);
  const s = cloneState(s0);
  const g = garrisonOf(s.outposts[i]);

  for (const u of UNIT_IDS) g[u] = Math.max(0, g[u] - (engaged[u] ?? 0));
  s.outposts[i].garrison = g;

  return s;
}

/** Puts troops back into the garrison (after the battle, or if it couldn't be fought). */
export function returnToGarrison(s0: GameState, idx: number, units: Army): GameState {
  const s = cloneState(s0);
  const o = s.outposts?.[Math.floor(Number(idx))];

  // The outpost is gone (it can't be today, but a save could be odd): they go home.
  const into = o ? garrisonOf(o) : s.army;

  for (const u of UNIT_IDS) into[u] += units[u] ?? 0;
  if (o) o.garrison = into;

  return s;
}

/**
 * A battle at a garrisoned outpost, applied to its owner: the garrison learns
 * from the fight and its survivors (and wounded) go back to the outpost.
 * Nothing to loot and no gate to break, and no shield comes of it: a forward
 * base isn't the village. Returns the owner's new state and the attacker's report.
 */
export function defendOutpost(
  owner0: GameState,
  idx: number,
  attacker: GameState,
  sent: Army,
  now: number,
  opts: { outcome: BattleOutcome; engaged: Army; travelMs: number; carried?: Loot; carriedCoins?: number }
): { state: GameState; report: RaidReport } {
  const { outcome, engaged } = opts;
  const s = cloneState(owner0);
  const defenderXp = battleXp(s, engaged, outcome.attack, !outcome.attackerWon, "defense");
  const attackerXp = battleXp(attacker, sent, outcome.defense, outcome.attackerWon, "attack");
  const regiment = totalArmy(s);

  for (const u of UNIT_IDS) regiment[u] += engaged[u] ?? 0;
  const defenderPromoted = applyBattleXp(s, regiment, outcome.defenderLosses, defenderXp, outcome.attackerWon);
  const back = emptyArmy();

  for (const u of UNIT_IDS) back[u] = Math.max(0, (engaged[u] ?? 0) - (outcome.defenderLosses[u] ?? 0));
  const carried = opts.carried && Object.values(opts.carried).some((v) => v > 0) ? opts.carried : undefined;

  return {
    state: returnToGarrison(s, idx, back),
    report: {
      ...outcome,
      attackerXp,
      defenderXp,
      defenderPromoted,
      sent,
      defenders: { ...engaged },
      loot: { iron: 0, wood: 0, clay: 0, crop: 0 },
      coins: 0,
      returnsAt: now + opts.travelMs,
      ...(carried || (opts.carriedCoins ?? 0) > 0 ? { carried: { iron: 0, wood: 0, clay: 0, crop: 0, ...carried }, carriedCoins: opts.carriedCoins ?? 0 } : {}),
    },
  };
}
