"use client";
import { useState } from "react";
import clsx from "clsx";

import { ArmyLine, fmt } from "./shared";

import { Amount, Button, Card, Icon, Meter, Overline, Stat, Stepper } from "@/components/ui";
import { TroopArt } from "@/art";
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
  const affordable = Math.min(MAX_BATCH, ...RESOURCE_IDS.map((r) => Math.floor(state.resources[r] / unit.cost[r])));
  const seconds = unit.time * rates.trainSpeedMultiplier * count;

  const onTrain = async () => {
    setBusy(true);
    const ok = await train(unit.id, count);

    setBusy(false);
    if (ok) setCount(1);
  };

  return (
    <Card className={clsx("flex flex-col gap-3", !unlocked && "opacity-70")}>
      <div className="flex gap-3">
        <div className="relative w-[84px] h-[84px] shrink-0 rounded-2xl bg-[radial-gradient(ellipse_at_50%_30%,#4A3D2F_0%,#2A221A_70%)] border border-ink-400 overflow-hidden">
          <TroopArt className={clsx("absolute inset-0 w-full h-full", !unlocked && "grayscale opacity-60")} id={unit.id} />
          {!unlocked && (
            <span className="absolute inset-0 flex items-center justify-center text-parch-300">
              <Icon name="lock" size={26} />
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex justify-between items-baseline gap-2">
            <h3 className="font-display font-bold text-display-md leading-none">{unit.name}</h3>
            <span className="text-small whitespace-nowrap">
              <b className="font-extrabold">{fmt(state.army[unit.id])}</b>
              <span className="text-parch-500"> home{away ? ` · ${fmt(away)} away` : ""}</span>
            </span>
          </div>
          <p className="text-small text-parch-300">{unit.description}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <Amount icon="attack" size="xs" value={unit.attack} />
            <Amount icon="defense" size="xs" value={unit.defense} />
            <Amount icon="loot" size="xs" value={unit.carry} />
            <Amount icon="crop" size="xs" suffix="/h" tone="bad" value={`−${unit.upkeep}`} />
          </div>
        </div>
      </div>

      {unlocked ? (
        <div className="flex flex-col gap-2.5 p-2.5 rounded-xl bg-ink-950/50 border border-ink-600">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {RESOURCES.map((r) => (
              <Amount key={r.id} icon={r.id} tone={state.resources[r.id] < unit.cost[r.id] * count ? "bad" : undefined} value={unit.cost[r.id] * count} />
            ))}
            <Amount icon="time" tone="muted" value={formatDuration(seconds * 1000)} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Stepper max={Math.max(1, affordable)} value={count} onChange={(n) => setCount(Math.max(1, n))} />
            <Button disabled={affordable < count || count < 1} loading={busy} size="sm" onClick={onTrain}>
              Train
            </Button>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-small font-bold text-gold-300">
          <Icon name="lock" size={16} />
          Build {BUILDING_BY_ID[unit.requires.building].name} level {unit.requires.level} to unlock
        </p>
      )}
    </Card>
  );
};

export const ArmyTab = () => {
  const { state, rates, now } = useGame();
  const home = state.army;

  return (
    <div className="flex flex-col gap-2.5">
      <Card className="grid grid-cols-3 gap-2" tone="raised">
        <Stat icon="attack" label="Attack" value={fmt(attackPower(state, home))} />
        <Stat icon="defense" label="Defense" value={fmt(defensePower(state))} />
        <Stat icon="crop" label="Upkeep" tone={rates.troopUpkeep ? "bad" : undefined} value={rates.troopUpkeep ? `−${fmt(rates.troopUpkeep)}/h` : "0"} />
      </Card>

      {state.training.length > 0 && (
        <Card className="flex flex-col gap-2">
          <Overline>Training</Overline>
          {state.training.map((t, i) => {
            const unit = UNITS.find((u) => u.id === t.unit)!;
            const end = trainingEndsAt(t);
            const started = now >= t.startsAt;

            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-small font-bold">
                  <span className="flex items-center gap-1.5">
                    <TroopArt className="w-6 h-6" id={unit.id} />
                    {unit.name} {fmt(t.done)}/{fmt(t.count)}
                  </span>
                  <span className="text-parch-500">{started ? `${formatDuration(end - now)} left` : `starts in ${formatDuration(t.startsAt - now)}`}</span>
                </div>
                <Meter max={t.count} size="xs" tone="ember" value={t.done} />
              </div>
            );
          })}
        </Card>
      )}

      {state.marches.length > 0 && (
        <Card className="flex flex-col gap-1.5">
          <Overline>Armies returning</Overline>
          {state.marches.map((m) => (
            <div key={m.id} className="text-small flex justify-between items-center gap-2">
              <span className="truncate">
                From <b>{m.target}</b> <ArmyLine army={m.units} />
              </span>
              <span className="text-parch-500 shrink-0 font-bold">{formatDuration(m.returnsAt - now)}</span>
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
