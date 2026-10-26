"use client";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import { UnitBadge, fmt } from "./shared";

import { Button, Drawer } from "@/components";
import { useGame, useTelegramContext } from "@/context";
import { UNITS, UNIT_BY_ID } from "@/lib/game/config";
import { Army, GameState, emptyArmy } from "@/lib/game/engine";
import { Point, TERRAIN, Terrain, armySpeed, marchRoute, routeMs, shipsNeeded } from "@/lib/game/map";
import { battleNumbers, fighterCount, landingFactorFor } from "@/lib/game/war";
import { formatDuration } from "@/lib/format";

export type AttackTarget = {
  title: string;
  to: { target?: number; camp?: number };
  /** Known defense before terrain, or a range. */
  defense: { min: number; max: number; exact: boolean };
  /** Tiles from your tribe. */
  distance: number;
  terrain: Terrain;
  /** Your tribe and the target, to work out whether the march crosses the sea. */
  from: Point;
  at: Point;
  /** The target tribe's Harbor level (none for camps). */
  harbor?: number;
  note?: string;
};

/** Attack must beat the top of the defense by this much to count as "enough". */
const SAFETY = 1.25;

/** The same share of every troop type at home (ships go along by themselves). */
const scaled = (home: Army, f: number): Army => {
  const a = emptyArmy();

  for (const u of UNITS) if (!u.transport) a[u.id] = f >= 1 ? home[u.id] : Math.round(home[u.id] * f);

  return a;
};

/** Smallest share (in 5% steps) whose attack clears the defense with a margin, or null if even everything can't. */
function enoughShare(s: GameState, terrain: Terrain, defMax: number): number | null {
  for (let f = 0.05; f < 1.0001; f += 0.05) {
    if (battleNumbers(s, scaled(s.army, f), null, terrain, 0).attack >= defMax * SAFETY) return Math.min(1, f);
  }

  return null;
}

const PRESETS = [
  { label: "¼", f: 0.25 },
  { label: "½", f: 0.5 },
  { label: "¾", f: 0.75 },
  { label: "All", f: 1 },
];

const sameArmy = (a: Army, b: Army) => UNITS.every((u) => a[u.id] === b[u.id]);

export const SendArmyDrawer = ({
  target,
  onClose,
  onSent,
}: {
  target: AttackTarget | null;
  onClose: () => void;
  onSent: (march: { id: number; arrivesAt: number }) => void;
}) => {
  const { state, rates, now, attack } = useGame();
  const { telegram } = useTelegramContext();
  const [units, setUnits] = useState<Army>(emptyArmy());
  const [busy, setBusy] = useState(false);

  const terrain = target?.terrain ?? "plains";
  const route = target ? marchRoute(target.from, target.at) : null;
  const naval = !!route?.naval;
  // Landing on a tribe's beach favours them; barbarian camps have no harbor to defend.
  const landing = naval && target?.to.target ? landingFactorFor(target.harbor ?? 0) : 1;
  const ground = (1 + TERRAIN[terrain].defense) * landing;
  const d = target?.defense;
  const defMin = d ? d.min * ground : 0;
  const defMax = d ? d.max * ground : 0;

  // Just enough to win comfortably, so the rest of the army stays home to defend.
  const enough = useMemo(
    () => (target ? enoughShare(state, terrain, defMax) : null),
    // Recompute when a new target opens, not on every resource tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target?.title, defMax]
  );

  // Open at half the army (never everything, so home stays defended), or at
  // "enough" when half wouldn't win. Sending more also brings back more loot.
  useEffect(() => {
    if (target) setUnits(scaled(state.army, Math.max(0.5, enough ?? 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.title]);

  const { attack: power } = battleNumbers(state, units, null, terrain, 0);
  const verdict = !d ? "" : power > defMax * 1.1 ? "Likely victory" : power < defMin * 0.9 ? "Likely defeat" : "Close fight";
  const tone = verdict === "Likely victory" ? "good" : verdict === "Likely defeat" ? "bad" : "even";
  const ships = naval ? shipsNeeded(units) : 0;
  const shipsHome = state.army.longship;
  const shortOfShips = naval && ships > shipsHome;
  const carry = UNITS.reduce((s, u) => s + u.carry * units[u.id], 0) + (naval ? ships * UNIT_BY_ID.longship.carry : 0);
  const travel = target ? routeMs(units, target.from, target.at, rates.marchMultiplier) : 0;
  const slowest = UNITS.find((u) => !u.transport && units[u.id] > 0 && u.speed === armySpeed(units));
  const hasCavalry = UNITS.some((u) => u.mounted && units[u.id] > 0);
  const size = fighterCount(units);
  const home = UNITS.filter((u) => !u.transport && state.army[u.id] > 0);
  // Attack's share of attack + defense, for the balance bar.
  const balance = power + defMax > 0 ? power / (power + (defMin + defMax) / 2) : 0;

  const presets = [
    // Skip "Enough" when it lands on one of the fixed picks anyway.
    ...(enough != null && !PRESETS.some((p) => Math.abs(p.f - enough) < 0.01) ? [{ label: "Enough", f: enough }] : []),
    ...PRESETS,
  ];

  const send = async () => {
    if (!target) return;
    setBusy(true);
    const march = await attack(target.to, units);

    setBusy(false);
    if (march) {
      telegram?.WebApp.HapticFeedback.notificationOccurred("success");
      onSent(march);
    }
  };

  const setOne = (id: keyof Army, n: number) =>
    setUnits((a) => ({ ...a, [id]: Math.max(0, Math.min(state.army[id], Math.floor(n || 0))) }));

  return (
    <Drawer isOpen={!!target} position="bottom" title={target?.title} onClose={onClose}>
      {target && d && (
        <div className="flex flex-col gap-3 pt-2">
          {target.note && <p className="text-xs text-[#E3A948]">{target.note}</p>}

          {/* Where the fight will be */}
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="px-2 py-1 rounded-lg bg-panel2 border border-line">📍 {target.distance} tiles away</span>
            <span className="px-2 py-1 rounded-lg bg-panel2 border border-line">
              {terrain === "mountains" || terrain === "hills" ? "⛰️" : terrain === "forest" ? "🌲" : "🌾"} {TERRAIN[terrain].name}
              {TERRAIN[terrain].defense > 0 && <span className="text-[#F08A6C]"> · +{TERRAIN[terrain].defense * 100}% their defense</span>}
            </span>
            {route?.detour && (
              <span className="px-2 py-1 rounded-lg bg-panel2 border border-line">
                🛤️ {route.climbed ? "No road: a hard climb" : naval ? "Sea road" : "Road winds around"} · {Math.round(route.length)} tiles
              </span>
            )}
            {naval && (
              <span className="px-2 py-1 rounded-lg bg-[#14222A] border border-[#4F86A3] text-[#A9D3EA]">
                🌊 Across the sea
                {landing > 1 && <span className="text-[#F08A6C]"> · +{Math.round((landing - 1) * 100)}% their defense (beach)</span>}
              </span>
            )}
            {terrain === "forest" && hasCavalry && (
              <span className="px-2 py-1 rounded-lg bg-[#2A140E] border border-[#8A3B23] text-[#FFB27A]">🐎 horsemen −25% in forest</span>
            )}
          </div>

          {/* Quick picks for the whole army */}
          <div className="flex items-center gap-1 bg-panel border border-line rounded-xl p-1">
            {presets.map((p) => {
              // An empty pick matches every preset when nobody is home, so only a real selection counts.
              const active = size > 0 && sameArmy(units, scaled(state.army, p.f));
              const disabled = home.length === 0;

              return (
                <button
                  key={p.label}
                  disabled={disabled}
                  className={clsx(
                    "flex-1 h-8 rounded-[9px] text-xs font-extrabold transition disabled:opacity-40",
                    active ? "bg-gold text-[#1A120B]" : "text-muted",
                    p.label === "Enough" && !active && "text-good"
                  )}
                  onClick={() => setUnits(scaled(state.army, p.f))}
                >
                  {p.label === "Enough" ? `✓ Enough` : p.label}
                </button>
              );
            })}
          </div>

          {/* Only troop types you have at home. */}
          <div className="flex flex-col gap-2">
            {home.map((u) => {
              const max = state.army[u.id];
              const n = units[u.id];

              return (
                <div
                  key={u.id}
                  className={clsx(
                    "rounded-xl border px-2.5 py-2 flex flex-col gap-1.5 transition-colors",
                    n > 0 ? "bg-buildingBg border-line" : "bg-panel/60 border-line/60 opacity-70"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <UnitBadge size={30} unit={u.id} />
                    <div className="flex-1 min-w-0 leading-tight">
                      <div className="text-sm font-bold truncate">{u.name}</div>
                      <div className="text-[10px] text-[#B19C80]">
                        {fmt(max - n)} stay home · {u.speed}s/tile
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        aria-label={`fewer ${u.name}`}
                        className="w-7 h-7 rounded-lg bg-[#1E1610] font-bold disabled:opacity-30"
                        disabled={n <= 0}
                        onClick={() => setOne(u.id, n - 1)}
                      >
                        −
                      </button>
                      <input
                        aria-label={`${u.name} to send`}
                        className="w-12 h-7 rounded-lg bg-[#1E1610] text-center text-sm font-extrabold outline-none focus:ring-1 focus:ring-gold"
                        inputMode="numeric"
                        value={n}
                        onChange={(e) => setOne(u.id, Number(e.target.value.replace(/\D/g, "")))}
                      />
                      <button
                        aria-label={`more ${u.name}`}
                        className="w-7 h-7 rounded-lg bg-[#1E1610] font-bold disabled:opacity-30"
                        disabled={n >= max}
                        onClick={() => setOne(u.id, n + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      aria-label={`${u.name} slider`}
                      className="flex-1 h-1.5 accent-[#E3A948]"
                      max={max}
                      min={0}
                      type="range"
                      value={n}
                      onChange={(e) => setOne(u.id, Number(e.target.value))}
                    />
                    <span className="w-14 text-right text-[10px] font-bold text-muted">
                      {n} / {fmt(max)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ships for a sea crossing */}
          {naval && (
            <div
              className={clsx(
                "rounded-xl border px-2.5 py-2 flex items-center gap-2 text-xs",
                shortOfShips ? "bg-[#2A140E] border-[#8A3B23] text-[#FFB27A]" : "bg-[#14222A] border-[#4F86A3] text-[#A9D3EA]"
              )}
            >
              <span className="text-xl animate-sail">⛵</span>
              <span className="flex-1">
                {(state.buildings["harbor"] ?? 0) === 0 ? (
                  <>Build a <b>Harbor</b> and Longships to cross the sea.</>
                ) : (
                  <>
                    <b>
                      {fmt(ships)} / {fmt(shipsHome)} Longships
                    </b>{" "}
                    {shortOfShips
                      ? `· ${fmt(ships - shipsHome)} more needed, or send fewer troops`
                      : `· ${Math.max(1, Math.round(route!.sea))} tiles at sea, sailing ${UNIT_BY_ID.longship.speed}s/tile`}
                  </>
                )}
              </span>
            </div>
          )}

          {/* Attack vs defense */}
          <div className="rounded-xl bg-panel border border-line p-2.5 flex flex-col gap-2">
            <div className="flex justify-between items-baseline text-sm">
              <span className="font-extrabold">⚔️ {fmt(power)}</span>
              <span
                className={clsx(
                  "text-xs font-extrabold",
                  !size ? "text-muted" : tone === "good" ? "text-good" : tone === "bad" ? "text-[#F08A6C]" : "text-[#E3A948]"
                )}
              >
                {size ? verdict : "Choose troops"}
              </span>
              <span className="font-extrabold">
                {d.exact ? fmt(defMin) : `${fmt(defMin)}–${fmt(defMax)}`} 🛡️
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-[#5A2A1E] overflow-hidden">
              <div
                className={clsx(
                  "absolute inset-y-0 left-0 rounded-full transition-all",
                  tone === "good" ? "bg-good" : tone === "bad" ? "bg-[#F08A6C]" : "bg-gold"
                )}
                style={{ width: `${Math.round(balance * 100)}%` }}
              />
              <div className="absolute inset-y-0 left-1/2 w-px bg-parch/50" />
            </div>
            <div className="grid grid-cols-3 text-center text-[11px] font-bold text-sub">
              <span>👥 {fmt(size)} troops</span>
              <span>🎒 {fmt(carry)} loot</span>
              <span>⏱ {size ? formatDuration(travel) : "–"}</span>
            </div>
          </div>

          {size > 0 && (
            <p className="text-[11px] text-center text-[#B19C80] -mt-1">
              Luck can swing it ±10%.
              {slowest && size > units[slowest.id] ? ` ${UNIT_BY_ID[slowest.id].name} set the pace.` : ""} Back home in{" "}
              {formatDuration(travel * 2)}.
              {!d.exact && " Defense is a guess; scout first to know."}
            </p>
          )}

          <Button isFull disabled={busy || size === 0 || shortOfShips} size="large" onClick={send}>
            {size === 0
              ? "Choose troops"
              : shortOfShips
                ? `Need ${fmt(ships)} Longships`
              : busy
                ? "Marching…"
                : `${naval ? "⛵ Sail" : "⚔️ March"} · arrives ${new Date(now + travel).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </Button>
        </div>
      )}
    </Drawer>
  );
};
