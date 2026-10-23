"use client";
import { useEffect, useState } from "react";

import { Stepper, UnitBadge, fmt } from "./shared";

import { Button, Drawer } from "@/components";
import { useGame, useTelegramContext, BattleReport } from "@/context";
import { UNITS } from "@/lib/game/config";
import { Army, emptyArmy } from "@/lib/game/engine";
import { armySize, attackPower } from "@/lib/game/war";

export type AttackTarget = {
  title: string;
  to: { target?: number; camp?: number };
  /** Known defense, or a range. */
  defense: { min: number; max: number; exact: boolean };
  note?: string;
};

export const SendArmyDrawer = ({
  target,
  onClose,
  onResult,
}: {
  target: AttackTarget | null;
  onClose: () => void;
  onResult: (r: BattleReport) => void;
}) => {
  const { state, attack } = useGame();
  const { telegram } = useTelegramContext();
  const [units, setUnits] = useState<Army>(emptyArmy());
  const [busy, setBusy] = useState(false);

  // Default to sending everything that can attack.
  useEffect(() => {
    if (target) setUnits({ ...state.army });
  }, [target?.title]);

  const power = attackPower(state, units);
  const carry = UNITS.reduce((s, u) => s + u.carry * units[u.id], 0);
  const d = target?.defense;
  const verdict = !d
    ? ""
    : power > d.max * 1.1
    ? "Likely victory"
    : power < d.min * 0.9
    ? "Likely defeat"
    : "Close fight";

  const send = async () => {
    if (!target) return;
    setBusy(true);
    const report = await attack(target.to, units);

    setBusy(false);
    if (report) {
      telegram?.WebApp.HapticFeedback.notificationOccurred(report.attackerWon ? "success" : "error");
      onResult(report);
    }
  };

  return (
    <Drawer isOpen={!!target} position="bottom" title={target?.title} onClose={onClose}>
      {target && d && (
        <div className="flex flex-col gap-3 pt-2">
          {target.note && <p className="text-xs text-[#E3A948]">{target.note}</p>}
          {UNITS.map((u) => (
            <div key={u.id} className="flex items-center gap-2">
              <UnitBadge size={32} unit={u.id} />
              <div className="flex-1 text-sm">
                <div className="font-bold">{u.name}</div>
                <div className="text-[10px] text-[#B19C80]">{fmt(state.army[u.id])} at home</div>
              </div>
              <Stepper
                max={state.army[u.id]}
                value={units[u.id]}
                onChange={(n) => setUnits((a) => ({ ...a, [u.id]: n }))}
              />
            </div>
          ))}

          <div className="grid grid-cols-3 text-center bg-[#1E1610] rounded p-2 text-sm">
            <div>
              <div className="text-[10px] text-[#B19C80]">YOUR ATTACK</div>
              <b>⚔️ {fmt(power)}</b>
            </div>
            <div>
              <div className="text-[10px] text-[#B19C80]">THEIR DEFENSE</div>
              <b>🛡️ {d.exact ? fmt(d.min) : `${fmt(d.min)}–${fmt(d.max)}`}</b>
            </div>
            <div>
              <div className="text-[10px] text-[#B19C80]">CAN CARRY</div>
              <b>🎒 {fmt(carry)}</b>
            </div>
          </div>
          {armySize(units) > 0 && (
            <p
              className={
                verdict === "Likely victory"
                  ? "text-center text-sm font-bold text-good"
                  : verdict === "Likely defeat"
                  ? "text-center text-sm font-bold text-[#F08A6C]"
                  : "text-center text-sm font-bold text-[#E3A948]"
              }
            >
              {verdict} · luck can swing it ±10%
            </p>
          )}
          <Button isFull disabled={busy || armySize(units) === 0} size="large" onClick={send}>
            {armySize(units) === 0 ? "Choose troops" : "⚔️ Attack"}
          </Button>
        </div>
      )}
    </Drawer>
  );
};
