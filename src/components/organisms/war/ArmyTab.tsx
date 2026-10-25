"use client";
import { useState } from "react";
import clsx from "clsx";
import Image from "next/image";

import { ArmyLine, Card, Stepper, UnitIcon, fmt } from "./shared";
import { RANK_METAL, TroopPortrait } from "./TroopPortrait";

import { Button } from "@/components";
import { RESOURCES, useGame } from "@/context";
import {
  BUILDING_BY_ID,
  MAX_BATCH,
  MAX_UNIT_UPGRADE,
  RANKS,
  RANK_BONUS,
  RESOURCE_IDS,
  UNITS,
  UPGRADE_BONUS,
  UPGRADE_BUILDING,
  UPGRADE_NAMES,
  UnitDef,
  upgradeCapForRank,
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

const pct = (x: number) => `+${Math.round(x * 100)}%`;

/** One stat with its base value and what ranks and upgrades add on top. */
const Stat = ({ label, value, base, note }: { label: string; value: number; base?: number; note?: string }) => {
  const bonus = base ? value / base - 1 : 0;

  return (
    <div className="bg-panel rounded-lg px-2 py-1.5 border border-line/60">
      <div className="text-[10px] tracking-wide text-muted uppercase">{label}</div>
      <div className="font-bold leading-tight">
        {Number.isInteger(value) ? fmt(value) : value.toFixed(1)}
        {bonus > 0.001 && <span className="text-good text-[11px] font-bold ml-1">{pct(bonus)}</span>}
        {note && <span className="text-muted text-[11px] font-normal ml-1">{note}</span>}
      </div>
    </div>
  );
};

/** Ten diamonds: forged levels filled, levels the current rank allows outlined, the rest dim. */
const UpgradePips = ({ level, cap }: { level: number; cap: number }) => (
  <div className="flex gap-[3px]" title={`Upgrade ${level}/${MAX_UNIT_UPGRADE}`}>
    {Array.from({ length: MAX_UNIT_UPGRADE }, (_, i) => (
      <span
        key={i}
        className={clsx(
          "w-2 h-2 rotate-45 rounded-[1px] border",
          i < level ? "bg-goldtext border-goldtext" : i < cap ? "border-gold/70" : "border-line"
        )}
      />
    ))}
  </div>
);

const RankBar = ({ unit }: { unit: UnitDef }) => {
  const { state } = useGame();
  const t = troopInfo(state, unit.id);
  const metal = RANK_METAL[t.rank];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-display font-bold" style={{ color: metal.label }}>
          {t.rankName}
          <span className="text-muted font-sans font-normal"> · {pct(t.rank * RANK_BONUS)} from rank</span>
        </span>
        <span className="text-muted">
          {t.nextRank ? `${fmt(t.xp)} / ${fmt(t.nextRank.xp)} XP` : `${fmt(t.xp)} XP · top rank`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-panel overflow-hidden border border-line/60">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.max(2, t.progress * 100)}%`,
            background: `linear-gradient(90deg, ${metal.dark}, ${metal.mid} 60%, ${metal.light})`,
          }}
        />
      </div>
      {t.nextRank && (
        <div className="text-[10px] text-muted">
          Win battles to reach <b className="text-sub">{t.nextRank.name}</b> — losses cost experience.
        </div>
      )}
    </div>
  );
};

const TrainSection = ({ unit }: { unit: UnitDef }) => {
  const { state, rates, train } = useGame();
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const affordable = Math.min(MAX_BATCH, ...RESOURCE_IDS.map((r) => Math.floor(state.resources[r] / unit.cost[r])));
  const seconds = unit.time * rates.trainSpeedMultiplier * count;

  const onTrain = async () => {
    setBusy(true);
    const ok = await train(unit.id, count);

    setBusy(false);
    if (ok) setCount(1);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {RESOURCES.map((r) => (
          <span
            key={r.id}
            className={clsx("flex items-center gap-1", state.resources[r.id] < unit.cost[r.id] * count && "text-bad")}
          >
            <Image alt={r.name} className="h-3.5 w-3.5" src={r.img} />
            {fmt(unit.cost[r.id] * count)}
          </span>
        ))}
        <span className="text-muted">⏱ {formatDuration(seconds * 1000)}</span>
      </div>
      <p className="text-[10px] text-muted">New recruits join the regiment at its current rank.</p>
      <div className="flex items-center justify-between gap-2">
        <Stepper max={Math.max(1, affordable)} value={count} onChange={(n) => setCount(Math.max(1, n))} />
        <Button disabled={busy || affordable < count || count < 1} size="small" onClick={onTrain}>
          Train
        </Button>
      </div>
    </div>
  );
};

const UpgradeSection = ({ unit }: { unit: UnitDef }) => {
  const { state, now, upgradeTroop } = useGame();
  const [busy, setBusy] = useState(false);
  const info = troopUpgradeInfo(state, unit.id);
  const t = troopInfo(state, unit.id);
  const arsenal = state.buildings[UPGRADE_BUILDING.building] ?? 0;
  const forge = state.forge;
  const mine = forge?.unit === unit.id ? forge : null;
  const canPay = RESOURCE_IDS.every((r) => state.resources[r] >= info.cost[r]);
  const nextRankForCap = RANKS.findIndex((_, i) => upgradeCapForRank(i) > info.level);

  const onUpgrade = async () => {
    setBusy(true);
    await upgradeTroop(unit.id);
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs">
          <span className="font-bold text-sub">{UPGRADE_NAMES[info.level]}</span>
          <span className="text-muted"> · {pct(info.level * UPGRADE_BONUS)} attack &amp; defense</span>
        </div>
        <UpgradePips cap={t.cap} level={info.level} />
      </div>

      {arsenal < UPGRADE_BUILDING.level ? (
        <p className="text-xs text-gold">🔒 Build the {BUILDING_BY_ID[UPGRADE_BUILDING.building].name} to forge better gear</p>
      ) : info.maxed ? (
        <p className="text-xs text-good">Fully upgraded — the finest gear in the land.</p>
      ) : mine ? (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span>
              Forging <b>{UPGRADE_NAMES[mine.toLevel]}</b>
            </span>
            <span className="text-muted">{formatDuration(mine.endsAt - now)} left</span>
          </div>
          <div className="h-1.5 rounded-full bg-panel overflow-hidden">
            <div
              className="h-full bg-ember"
              style={{ width: `${Math.min(100, ((now - mine.startedAt) / (mine.endsAt - mine.startedAt)) * 100)}%` }}
            />
          </div>
        </div>
      ) : info.rankLocked ? (
        <p className="text-xs text-gold">
          🎖️ Reach <b>{RANKS[nextRankForCap]?.name ?? "a higher rank"}</b> in battle to forge beyond level {info.level}.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span className="text-muted">
              Next: <b className="text-sub">{UPGRADE_NAMES[info.level + 1]}</b> ({pct(UPGRADE_BONUS)})
            </span>
            {RESOURCES.map((r) => (
              <span key={r.id} className={clsx("flex items-center gap-1", state.resources[r.id] < info.cost[r.id] && "text-bad")}>
                <Image alt={r.name} className="h-3.5 w-3.5" src={r.img} />
                {fmt(info.cost[r.id])}
              </span>
            ))}
            <span className="text-muted">⏱ {formatDuration(info.seconds * 1000)}</span>
          </div>
          <Button
            className="self-end"
            disabled={busy || !canPay || !!forge}
            size="small"
            variant="outline"
            onClick={onUpgrade}
          >
            {forge ? "Arsenal busy" : "Forge upgrade"}
          </Button>
        </>
      )}
    </div>
  );
};

const UnitCard = ({ unit }: { unit: UnitDef }) => {
  const { state } = useGame();
  const [tab, setTab] = useState<"train" | "upgrade">("train");
  const unlocked = unitUnlocked(state, unit.id);
  const away = state.marches.reduce((n, m) => n + (m.units[unit.id] ?? 0), 0);
  const t = troopInfo(state, unit.id);

  return (
    <Card className={clsx("flex flex-col gap-3", !unlocked && "opacity-60")}>
      <div className="flex gap-3 items-center">
        <TroopPortrait rank={t.rank} size={68} unit={unit.id} />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline gap-2">
            <h3 className="font-display font-bold text-[17px] text-parch truncate">{unit.name}</h3>
            <span className="text-sm shrink-0">
              <b>{fmt(state.army[unit.id])}</b>
              <span className="text-muted"> home{away ? ` · ${fmt(away)} away` : ""}</span>
            </span>
          </div>
          <p className="text-xs text-muted leading-snug">{unit.description}</p>
        </div>
      </div>

      {unlocked && <RankBar unit={unit} />}

      <div className="grid grid-cols-4 gap-1.5 text-sm">
        <Stat base={unit.attack} label="Attack" value={Math.round(unitAttack(state, unit.id) * 10) / 10} />
        <Stat base={unit.defense} label="Defense" value={Math.round(unitDefense(state, unit.id) * 10) / 10} />
        <Stat label="Carry" value={unit.carry} />
        <Stat label="Speed" note="s/tile" value={unit.speed} />
      </div>
      <div className="text-[11px] text-bad -mt-1.5">Eats {unit.upkeep} crop per hour each</div>

      {unlocked ? (
        <>
          <div className="flex bg-panel border border-line rounded-lg p-0.5 gap-0.5 text-xs font-bold">
            {(["train", "upgrade"] as const).map((k) => (
              <button
                key={k}
                className={clsx("flex-1 h-7 rounded-md", tab === k ? "bg-panel2 text-goldtext" : "text-muted")}
                onClick={() => setTab(k)}
              >
                {k === "train" ? "Train" : `Arsenal · Lv ${t.level}`}
              </button>
            ))}
          </div>
          {tab === "train" ? <TrainSection unit={unit} /> : <UpgradeSection unit={unit} />}
        </>
      ) : (
        <p className="text-xs text-gold">
          🔒 Build {BUILDING_BY_ID[unit.requires.building].name} to level {unit.requires.level} to unlock
        </p>
      )}
    </Card>
  );
};

export const ArmyTab = () => {
  const { state, rates, now } = useGame();
  const home = state.army;
  const forge = state.forge;

  return (
    <div className="flex flex-col gap-2">
      <Card className="grid grid-cols-3 text-center">
        <div>
          <div className="text-[10px] text-muted">ATTACK</div>
          <div className="font-bold">⚔️ {fmt(attackPower(state, home))}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted">DEFENSE</div>
          <div className="font-bold">🛡️ {fmt(defensePower(state))}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted">UPKEEP</div>
          <div className="font-bold text-bad">{rates.troopUpkeep ? `-${fmt(rates.troopUpkeep)}` : 0}/h</div>
        </div>
      </Card>

      {(state.training.length > 0 || forge) && (
        <Card className="flex flex-col gap-1">
          <h3 className="font-bold text-sm">In progress</h3>
          {state.training.map((t, i) => {
            const unit = UNITS.find((u) => u.id === t.unit)!;
            const end = trainingEndsAt(t);
            const started = now >= t.startsAt;

            return (
              <div key={i} className="flex justify-between text-sm gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <UnitIcon unit={unit.id} /> {unit.name} {fmt(t.done)}/{fmt(t.count)}
                </span>
                <span className="text-muted">
                  {started ? `${formatDuration(end - now)} left` : `starts in ${formatDuration(t.startsAt - now)}`}
                </span>
              </div>
            );
          })}
          {forge && (
            <div className="flex justify-between text-sm gap-2">
              <span className="inline-flex items-center gap-1.5">
                <UnitIcon unit={forge.unit} /> ⚒️ {UPGRADE_NAMES[forge.toLevel]}
              </span>
              <span className="text-muted">{formatDuration(forge.endsAt - now)} left</span>
            </div>
          )}
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
              <span className="text-muted shrink-0">{formatDuration(m.returnsAt - now)}</span>
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
