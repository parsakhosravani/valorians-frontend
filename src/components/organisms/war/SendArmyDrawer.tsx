"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";

import { Stepper, UnitBadge, fmt } from "./shared";

import { Button, Drawer } from "@/components";
import { useGame, useTelegramContext } from "@/context";
import { UNITS, UNIT_BY_ID } from "@/lib/game/config";
import { Army, emptyArmy } from "@/lib/game/engine";
import { TERRAIN, Terrain, armySpeed, marchMs } from "@/lib/game/map";
import { armySize, battleNumbers } from "@/lib/game/war";
import { formatDuration } from "@/lib/format";

export type AttackTarget = {
  title: string;
  to: { target?: number; camp?: number };
  /** Known defense before terrain, or a range. */
  defense: { min: number; max: number; exact: boolean };
  /** Tiles from your tribe. */
  distance: number;
  terrain: Terrain;
  note?: string;
};

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

  // Default to sending everything at home.
  useEffect(() => {
    if (target) setUnits({ ...state.army });
  }, [target?.title]);

  const terrain = target?.terrain ?? "plains";
  const ground = 1 + TERRAIN[terrain].defense;
  const { attack: power } = battleNumbers(state, units, null, terrain, 0);
  const carry = UNITS.reduce((s, u) => s + u.carry * units[u.id], 0);
  const d = target?.defense;
  const defMin = d ? d.min * ground : 0;
  const defMax = d ? d.max * ground : 0;
  const verdict = !d ? "" : power > defMax * 1.1 ? "Likely victory" : power < defMin * 0.9 ? "Likely defeat" : "Close fight";
  const travel = target ? marchMs(units, target.distance, rates.marchMultiplier) : 0;
  const slowest = UNITS.find((u) => units[u.id] > 0 && u.speed === armySpeed(units));
  const hasCavalry = UNITS.some((u) => u.mounted && units[u.id] > 0);

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

  return (
    <Drawer isOpen={!!target} position="bottom" title={target?.title} onClose={onClose}>
      {target && d && (
        <div className="flex flex-col gap-3 pt-2">
          {target.note && <p className="text-xs text-[#E3A948]">{target.note}</p>}

          {/* Where the fight will be */}
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="px-2 py-1 rounded-lg bg-panel2 border border-line">📍 {target.distance} tiles away</span>
            <span className="px-2 py-1 rounded-lg bg-panel2 border border-line">
              {terrain === "hills" ? "⛰️" : terrain === "forest" ? "🌲" : "🌾"} {TERRAIN[terrain].name}
              {TERRAIN[terrain].defense > 0 && <span className="text-[#F08A6C]"> · +{TERRAIN[terrain].defense * 100}% their defense</span>}
            </span>
            {terrain === "forest" && hasCavalry && (
              <span className="px-2 py-1 rounded-lg bg-[#2A140E] border border-[#8A3B23] text-[#FFB27A]">🐎 horsemen −25% in forest</span>
            )}
          </div>

          {/* Only troop types you have at home. */}
          {UNITS.filter((u) => state.army[u.id] > 0).map((u) => (
            <div key={u.id} className="flex items-center gap-2">
              <UnitBadge size={32} unit={u.id} />
              <div className="flex-1 text-sm">
                <div className="font-bold">{u.name}</div>
                <div className="text-[10px] text-[#B19C80]">
                  {fmt(state.army[u.id])} at home · {u.speed}s/tile
                </div>
              </div>
              <Stepper max={state.army[u.id]} value={units[u.id]} onChange={(n) => setUnits((a) => ({ ...a, [u.id]: n }))} />
            </div>
          ))}

          <div className="grid grid-cols-4 text-center bg-[#1E1610] rounded-xl p-2 text-sm gap-1">
            <div>
              <div className="text-[10px] text-[#B19C80]">ATTACK</div>
              <b>⚔️ {fmt(power)}</b>
            </div>
            <div>
              <div className="text-[10px] text-[#B19C80]">DEFENSE</div>
              <b>🛡️ {d.exact ? fmt(defMin) : `${fmt(defMin)}–${fmt(defMax)}`}</b>
            </div>
            <div>
              <div className="text-[10px] text-[#B19C80]">CARRY</div>
              <b>🎒 {fmt(carry)}</b>
            </div>
            <div>
              <div className="text-[10px] text-[#B19C80]">MARCH</div>
              <b>⏱ {armySize(units) ? formatDuration(travel) : "–"}</b>
            </div>
          </div>
          {armySize(units) > 0 && (
            <div className="flex flex-col items-center gap-0.5 text-center">
              <p
                className={clsx(
                  "text-sm font-bold",
                  verdict === "Likely victory" ? "text-good" : verdict === "Likely defeat" ? "text-[#F08A6C]" : "text-[#E3A948]"
                )}
              >
                {verdict} · luck can swing it ±10%
              </p>
              <p className="text-xs text-[#B19C80]">
                Arrives in {formatDuration(travel)}
                {slowest && armySize(units) > units[slowest.id] ? ` · ${UNIT_BY_ID[slowest.id].name} set the pace` : ""}. Back home{" "}
                {formatDuration(travel * 2)} from now.
                {!d.exact && " Defense is a guess; scout first to know."}
              </p>
            </div>
          )}
          <Button isFull disabled={busy || armySize(units) === 0} size="large" onClick={send}>
            {armySize(units) === 0 ? "Choose troops" : `⚔️ March · arrives ${new Date(now + travel).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </Button>
        </div>
      )}
    </Drawer>
  );
};
