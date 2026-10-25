"use client";
import { useState } from "react";
import clsx from "clsx";
import Image from "next/image";

import { ArmyLine, Card, Stepper, UnitBadge, fmt } from "./shared";
import { UnitIcon } from "./UnitIcon";

import { Button } from "@/components";
import { RESOURCES, useGame } from "@/context";
import {
  BUILDING_BY_ID,
  MAX_BATCH,
  RESOURCE_IDS,
  UNITS,
  UPGRADE_BONUS,
  UPGRADE_BUILDING,
  UnitDef,
} from "@/lib/game/config";
import { trainingEndsAt } from "@/lib/game/engine";
import {
  attackPower,
  defensePower,
  troopInfo,
  troopUpgradeInfo,
  unitAttack,
  unitDefense,
  unitUnlocked,
} from "@/lib/game/war";
import { formatDuration } from "@/lib/format";

/** Rank name, XP to the next rank and the upgrade from the Arsenal. */
const RankRow = ({ unit }: { unit: UnitDef }) => {
  const { state, now, upgradeTroop } = useGame();
  const [busy, setBusy] = useState(false);
  const t = troopInfo(state, unit.id);
  const up = troopUpgradeInfo(state, unit.id);
  const hasArsenal = (state.buildings[UPGRADE_BUILDING.building] ?? 0) >= UPGRADE_BUILDING.level;
  const forging = state.forge?.unit === unit.id ? state.forge : null;
  const canPay = RESOURCE_IDS.every((r) => state.resources[r] >= up.cost[r]);

  const onUpgrade = async () => {
    setBusy(true);
    await upgradeTroop(unit.id);
    setBusy(false);
  };

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span>
          🎖️ <b className="text-[#E3A948]">{t.rankName}</b>
          {t.rank > 0 && <span className="text-good"> +{t.rank * 4}%</span>}
        </span>
        <span className="text-[#B19C80]">
          {t.nextRank ? `${fmt(t.xp)} / ${fmt(t.nextRank.xp)} XP to ${t.nextRank.name}` : `${fmt(t.xp)} XP · top rank`}
        </span>
      </div>
      <div className="h-1 rounded-full bg-[#1E1610] overflow-hidden">
        <div className="h-full bg-[#E3A948]" style={{ width: `${Math.max(2, t.progress * 100)}%` }} />
      </div>
      {hasArsenal && (
        <div className="flex items-center justify-between gap-2 text-xs mt-1">
          <span>
            ⚒️ Upgrade <b>{up.level}</b>/{t.cap}
            {up.level > 0 && <span className="text-good"> +{Math.round(up.level * UPGRADE_BONUS * 100)}%</span>}
            {forging ? (
              <span className="text-[#B19C80]"> · forging, {formatDuration(forging.endsAt - now)} left</span>
            ) : up.maxed ? (
              <span className="text-[#B19C80]"> · max</span>
            ) : up.rankLocked ? (
              <span className="text-[#B19C80]"> · win battles to rank up</span>
            ) : null}
          </span>
          {!forging && !up.maxed && !up.rankLocked && (
            <Button disabled={busy || !canPay || !!state.forge} size="small" variant="outline" onClick={onUpgrade}>
              Upgrade
            </Button>
          )}
        </div>
      )}
      {hasArsenal && !forging && !up.maxed && !up.rankLocked && (
        <div className="flex flex-wrap gap-x-3 text-[11px] text-[#B19C80]">
          {RESOURCES.map((r) => (
            <span key={r.id} className={clsx("flex items-center gap-1", state.resources[r.id] < up.cost[r.id] && "text-[#F08A6C]")}>
              <Image alt={r.name} className="h-3 w-3" src={r.img} />
              {fmt(up.cost[r.id])}
            </span>
          ))}
          <span>⏱ {formatDuration(up.seconds * 1000)}</span>
        </div>
      )}
    </div>
  );
};

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
              <span className="text-[#B19C80]"> home{away ? ` · ${fmt(away)} away` : ""}</span>
            </span>
          </div>
          <p className="text-xs text-[#B19C80]">{unit.description}</p>
          <div className="flex gap-3 text-xs mt-1">
            <span>⚔️ {fmt(unitAttack(state, unit.id))}</span>
            <span>🛡️ {fmt(unitDefense(state, unit.id))}</span>
            <span>🎒 {unit.carry}</span>
            <span className="text-[#F08A6C]">-{unit.upkeep} crop/h</span>
          </div>
        </div>
      </div>

      {unlocked && <RankRow unit={unit} />}

      {unlocked ? (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {RESOURCES.map((r) => (
              <span
                key={r.id}
                className={clsx("flex items-center gap-1", state.resources[r.id] < unit.cost[r.id] * count && "text-[#F08A6C]")}
              >
                <Image alt={r.name} className="h-3.5 w-3.5" src={r.img} />
                {fmt(unit.cost[r.id] * count)}
              </span>
            ))}
            <span className="text-[#B19C80]">⏱ {formatDuration(seconds * 1000)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Stepper max={Math.max(1, affordable)} value={count} onChange={(n) => setCount(Math.max(1, n))} />
            <Button disabled={busy || affordable < count || count < 1} size="small" onClick={onTrain}>
              Train
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[#E3A948]">
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
          <div className="text-[10px] text-[#B19C80]">ATTACK</div>
          <div className="font-bold">⚔️ {fmt(attackPower(state, home))}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#B19C80]">DEFENSE</div>
          <div className="font-bold">🛡️ {fmt(defensePower(state))}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#B19C80]">UPKEEP</div>
          <div className="font-bold text-[#F08A6C]">{rates.troopUpkeep ? `-${fmt(rates.troopUpkeep)}` : 0}/h</div>
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
                  <UnitIcon className="inline-block align-[-5px]" size={20} unit={unit.id} /> {unit.name} {fmt(t.done)}/
                  {fmt(t.count)}
                </span>
                <span className="text-[#B19C80]">
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
              <span className="text-[#B19C80] shrink-0">{formatDuration(m.returnsAt - now)}</span>
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
