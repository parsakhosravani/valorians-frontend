"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";

import { UnitBadge, fmt } from "./shared";

import { Button, Card, Sheet, Stat, Stepper } from "@/components/ui";
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
  const verdict = !d ? "" : power > d.max * 1.1 ? "win" : power < d.min * 0.9 ? "lose" : "close";

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
    <Sheet open={!!target} title={target?.title} onClose={onClose}>
      {target && d && (
        <div className="flex flex-col gap-3">
          {target.note && <p className="text-small font-bold text-gold-300">{target.note}</p>}
          {UNITS.map((u) => (
            <div key={u.id} className="flex items-center gap-2.5">
              <UnitBadge size={44} unit={u.id} />
              <div className="flex-1 min-w-0">
                <div className="font-bold">{u.name}</div>
                <div className="text-caption font-bold text-parch-500">{fmt(state.army[u.id])} at home</div>
              </div>
              <Stepper max={state.army[u.id]} value={units[u.id]} onChange={(n) => setUnits((a) => ({ ...a, [u.id]: n }))} />
            </div>
          ))}

          <Card className="grid grid-cols-3 gap-1" tone="sunken">
            <Stat icon="attack" label="You" value={fmt(power)} />
            <Stat icon="defense" label="Them" value={d.exact ? fmt(d.min) : `${fmt(d.min)}–${fmt(d.max)}`} />
            <Stat icon="loot" label="Carry" value={fmt(carry)} />
          </Card>
          {armySize(units) > 0 && (
            <p
              className={clsx(
                "text-center text-small font-extrabold",
                verdict === "win" ? "text-moss-400" : verdict === "lose" ? "text-blood-400" : "text-gold-300"
              )}
            >
              {verdict === "win" ? "Likely victory" : verdict === "lose" ? "Likely defeat" : "Close fight"} · luck can swing it ±10%
            </p>
          )}
          <Button full disabled={armySize(units) === 0} icon="war" loading={busy} size="lg" variant="danger" onClick={send}>
            {armySize(units) === 0 ? "Choose troops" : "Attack"}
          </Button>
        </div>
      )}
    </Sheet>
  );
};
