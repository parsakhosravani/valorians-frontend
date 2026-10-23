"use client";
import { useState } from "react";
import clsx from "clsx";
import Image from "next/image";

import { ArmyLine, Card, Stepper, UnitBadge, fmt } from "./shared";

import { Button } from "@/components";
import { RESOURCES, useGame } from "@/context";
import { BUILDING_BY_ID, MAX_BATCH, RESOURCE_IDS, UNITS, UnitDef } from "@/lib/game/config";
import { trainingEndsAt } from "@/lib/game/engine";
import { attackPower, defensePower, unitUnlocked } from "@/lib/game/war";
import { formatDuration } from "@/lib/format";

const UnitCard = ({ unit }: { unit: UnitDef }) => {
  const { state, rates, train } = useGame();
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const unlocked = unitUnlocked(state, unit.id);
  const away = state.marches.reduce((n, m) => n + (m.units[unit.id] ?? 0), 0);
  const affordable = Math.min(
    MAX_BATCH,
    ...RESOURCE_IDS.map((r) => Math.floor(state.resources[r] / unit.cost[r]))
  );
  const seconds = unit.time * rates.trainSpeedMultiplier * count;

  const onTrain = async () => {
    setBusy(true);
    const ok = await train(unit.id, count);

    setBusy(false);
    if (ok) setCount(1);
  };

  return (
    <Card className={clsx(!unlocked && "opacity-60")}>
      <div className="flex gap-2.5 items-start">
        <UnitBadge size={44} unit={unit.id} />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline">
            <h3 className="font-bold">{unit.name}</h3>
            <span className="text-sm">
              <b>{fmt(state.army[unit.id])}</b>
              <span className="text-[#B5C7DE]"> home{away ? ` · ${fmt(away)} away` : ""}</span>
            </span>
          </div>
          <p className="text-xs text-[#B5C7DE]">{unit.description}</p>
          <div className="flex gap-3 text-xs mt-1">
            <span>⚔️ {unit.attack}</span>
            <span>🛡️ {unit.defense}</span>
            <span>🎒 {unit.carry}</span>
            <span className="text-[#F72214]">-{unit.upkeep} crop/h</span>
          </div>
        </div>
      </div>

      {unlocked ? (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {RESOURCES.map((r) => (
              <span
                key={r.id}
                className={clsx("flex items-center gap-1", state.resources[r.id] < unit.cost[r.id] * count && "text-[#F72214]")}
              >
                <Image alt={r.name} className="h-3.5 w-3.5" src={r.img} />
                {fmt(unit.cost[r.id] * count)}
              </span>
            ))}
            <span className="text-[#B5C7DE]">⏱ {formatDuration(seconds * 1000)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Stepper max={Math.max(1, affordable)} value={count} onChange={(n) => setCount(Math.max(1, n))} />
            <Button disabled={busy || affordable < count || count < 1} size="small" onClick={onTrain}>
              Train
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[#FCA234]">
          🔒 Build {BUILDING_BY_ID[unit.requires.building].name} to level {unit.requires.level} to unlock
        </p>
      )}
    </Card>
  );
};

export const ArmyTab = () => {
  const { state, rates, now } = useGame();
  const home = state.army;

  return (
    <div className="flex flex-col gap-2">
      <Card className="grid grid-cols-3 text-center">
        <div>
          <div className="text-[10px] text-[#B5C7DE]">ATTACK</div>
          <div className="font-bold">⚔️ {fmt(attackPower(state, home))}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#B5C7DE]">DEFENSE</div>
          <div className="font-bold">🛡️ {fmt(defensePower(state))}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#B5C7DE]">UPKEEP</div>
          <div className="font-bold text-[#F72214]">-{fmt(rates.troopUpkeep)}/h</div>
        </div>
      </Card>

      {state.training.length > 0 && (
        <Card>
          <h3 className="font-bold text-sm mb-1">Training</h3>
          {state.training.map((t, i) => {
            const unit = UNITS.find((u) => u.id === t.unit)!;
            const end = trainingEndsAt(t);
            const started = now >= t.startsAt;

            return (
              <div key={i} className="flex justify-between text-sm">
                <span>
                  {unit.icon} {unit.name} {fmt(t.done)}/{fmt(t.count)}
                </span>
                <span className="text-[#B5C7DE]">
                  {started ? `${formatDuration(end - now)} left` : `starts in ${formatDuration(t.startsAt - now)}`}
                </span>
              </div>
            );
          })}
        </Card>
      )}

      {state.marches.length > 0 && (
        <Card>
          <h3 className="font-bold text-sm mb-1">Armies returning</h3>
          {state.marches.map((m) => (
            <div key={m.id} className="text-sm flex justify-between gap-2">
              <span className="truncate">
                From {m.target}: <ArmyLine army={m.units} />
              </span>
              <span className="text-[#B5C7DE] shrink-0">{formatDuration(m.returnsAt - now)}</span>
            </div>
          ))}
        </Card>
      )}

      {UNITS.map((u) => (
        <UnitCard key={u.id} unit={u} />
      ))}
    </div>
  );
};
