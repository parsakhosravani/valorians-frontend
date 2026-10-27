"use client";
import { useState } from "react";
import clsx from "clsx";
import Image from "next/image";

import { ArmyLine, Card, Stepper, UnitBadge, UnitEmoji, fmt } from "./shared";

import { Button } from "@/components/atoms/Button";
import { RESOURCES, useGame } from "@/context";
import { BUILDING_BY_ID, MAX_BATCH, RANK_BONUS, RESOURCE_IDS, UNITS, UnitDef } from "@/lib/game/config";
import { TrainItem, maxTrainBatches, trainingEndsAt } from "@/lib/game/engine";
import {
  attackPower,
  defensePower,
  trainingRefund,
  troopInfo,
  unitAttack,
  unitDefense,
  unitUnlocked,
} from "@/lib/game/war";
import { formatDuration } from "@/lib/format";
import { GameIcon } from "@/components/atoms/GameIcon";

type Group = "all" | "infantry" | "cavalry" | "siege" | "fleet";

const GROUP_OF: Record<string, Exclude<Group, "all">> = {
  barracks: "infantry",
  stable: "cavalry",
  "siege-workshop": "siege",
  harbor: "fleet",
};

const GROUPS: { id: Group; label: string }[] = [
  { id: "all", label: "All" },
  { id: "infantry", label: "Infantry" },
  { id: "cavalry", label: "Cavalry" },
  { id: "siege", label: "Siege" },
  { id: "fleet", label: "Fleet" },
];

/** Rank name, XP bar and how to earn the next rank. */
const RankBar = ({ unit }: { unit: UnitDef }) => {
  const { state } = useGame();
  const t = troopInfo(state, unit.id);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span>
          <GameIcon e="🎖️" /> <b className="text-gold">{t.rankName}</b>
          {t.rank > 0 && <span className="text-good"> +{Math.round(t.rank * RANK_BONUS * 100)}% attack &amp; defense</span>}
        </span>
        <span className="text-muted">
          {t.nextRank ? `${fmt(t.xp)} / ${fmt(t.nextRank.xp)} XP` : `${fmt(t.xp)} XP · top rank`}
        </span>
      </div>
      <div className="bar h-1.5">
        <span className="bar-fill" style={{ width: `${Math.max(2, t.progress * 100)}%` }} />
      </div>
      {t.nextRank && (
        <p className="text-[11px] text-muted">
          Win battles with these troops to reach <b className="text-sub">{t.nextRank.name}</b>. Only troops that fight
          gain rank.
        </p>
      )}
    </div>
  );
};

const TrainPanel = ({ unit }: { unit: UnitDef }) => {
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
    <div className="inset flex flex-col gap-2 p-2.5">
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
        <span className="text-muted"><GameIcon e="⏱" /> {formatDuration(seconds * 1000)}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Stepper max={Math.max(1, affordable)} value={count} onChange={(n) => setCount(Math.max(1, n))} />
        <Button disabled={busy || affordable < count || count < 1} size="small" onClick={onTrain}>
          Train
        </Button>
      </div>
    </div>
  );
};

const UnitRow = ({ unit, open, onToggle }: { unit: UnitDef; open: boolean; onToggle: () => void }) => {
  const { state } = useGame();
  const t = troopInfo(state, unit.id);
  const away = state.marches.reduce((n, m) => n + (m.units[unit.id] ?? 0), 0);
  const training = state.training.filter((x) => x.unit === unit.id).reduce((n, x) => n + x.count - x.done, 0);

  return (
    <Card className={clsx("!p-0 overflow-hidden transition-colors", open && "border-gold/60")}>
      <button className="w-full flex items-center gap-3 p-3 text-left" onClick={onToggle}>
        <UnitBadge rank={t.rank} size={46} unit={unit.id} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold truncate">{unit.name}</h3>
            {t.rank > 0 && (
              <span className="pill pill-gold h-5 px-1.5 text-micro shrink-0">{t.rankName}</span>
            )}
          </div>
          {unit.transport ? (
            <div className="flex gap-2.5 text-xs text-sub mt-0.5">
              <span><GameIcon e="👥" /> {unit.transport} troops</span>
              <span><GameIcon e="🎒" /> {unit.carry}</span>
              <span className="text-muted"><GameIcon e="🌊" /> {unit.speed}s/tile</span>
            </div>
          ) : (
            <div className="flex gap-2.5 text-xs text-sub mt-0.5">
              <span><GameIcon e="⚔️" /> {fmt(unitAttack(state, unit.id))}</span>
              <span><GameIcon e="🛡️" /> {fmt(unitDefense(state, unit.id))}</span>
              <span><GameIcon e="🎒" /> {unit.carry}</span>
              <span className="text-muted"><GameIcon e="⏱" /> {unit.speed}s/tile</span>
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold text-lg leading-none">{fmt(state.army[unit.id])}</div>
          <div className="text-[10px] text-muted mt-0.5">
            {away ? `+${fmt(away)} away` : training ? `+${fmt(training)} training` : "at home"}
          </div>
        </div>
        <span className={clsx("text-muted text-xs transition-transform", open && "rotate-180")}>▼</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 px-3 pb-3">
          <p className="text-xs text-muted">
            {unit.description} <span className="text-bad">Eats {unit.upkeep} crop/h.</span>
          </p>
          {/* Ships never fight, so they never earn ranks. */}
          {!unit.transport && <RankBar unit={unit} />}
          <TrainPanel unit={unit} />
        </div>
      )}
    </Card>
  );
};

/** One line for a troop that isn't unlocked yet. */
const LockedRow = ({ unit }: { unit: UnitDef }) => (
  <div className="card-flat flex items-center gap-3 px-3 py-2 border-dashed opacity-70">
    <span className="text-xl grayscale">
      <UnitEmoji unit={unit.id} />
    </span>
    <span className="flex-1 text-sm font-bold">{unit.name}</span>
    <span className="text-[11px] text-gold">
      <GameIcon e="🔒" /> {BUILDING_BY_ID[unit.requires.building].name} {unit.requires.level}
    </span>
  </div>
);

/** One batch in the training queue, with a cancel button that asks before refunding. */
const TrainingRow = ({ item: t }: { item: TrainItem }) => {
  const { now, cancelTraining } = useGame();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const unit = UNITS.find((u) => u.id === t.unit)!;
  const end = trainingEndsAt(t);
  const started = now >= t.startsAt;
  const progress = started ? (now - t.startsAt) / Math.max(1, end - t.startsAt) : 0;
  const refund = trainingRefund(t);

  const onCancel = async () => {
    setBusy(true);
    await cancelTraining(t.startsAt);
    setBusy(false);
    setConfirming(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate">
          <UnitEmoji unit={unit.id} /> {unit.name} {fmt(t.done)}/{fmt(t.count)}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-muted">
            {started ? `${formatDuration(end - now)} left` : `starts in ${formatDuration(t.startsAt - now)}`}
          </span>
          {!confirming && (
            <button
              aria-label={`Cancel ${unit.name} training`}
              className="h-6 w-6 -mr-1 grid place-items-center rounded-full text-muted hover:text-bad hover:bg-[#F08A6C]/10"
              onClick={() => setConfirming(true)}
            >
              ✕
            </button>
          )}
        </span>
      </div>
      <div className="bar h-1.5">
        <span className="bar-fill !bg-none bg-good" style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>
      {confirming && (
        <div className="inset flex flex-col gap-2 p-2.5 mt-1">
          <div className="text-xs text-muted">
            Cancel the {fmt(t.count - t.done)} {unit.name} not yet trained?
            {t.done > 0 && ` The ${fmt(t.done)} already trained stay.`}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-muted">Refund</span>
            {RESOURCES.map((r) => (
              <span key={r.id} className="flex items-center gap-1 text-good">
                <Image alt={r.name} className="h-3.5 w-3.5" src={r.img} />+{fmt(refund[r.id])}
              </span>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button disabled={busy} size="small" variant="secondary" onClick={() => setConfirming(false)}>
              Keep
            </Button>
            <Button disabled={busy} size="small" variant="danger" onClick={onCancel}>
              Cancel training
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export const ArmyTab = () => {
  const { state, rates, now } = useGame();
  const [group, setGroup] = useState<Group>("all");
  const [open, setOpen] = useState<string | null>(null);
  const home = state.army;
  const inGroup = UNITS.filter((u) => group === "all" || GROUP_OF[u.requires.building] === group);
  const unlocked = inGroup.filter((u) => unitUnlocked(state, u.id));
  const locked = inGroup.filter((u) => !unitUnlocked(state, u.id));
  const countIn = (g: Group) =>
    UNITS.filter((u) => g === "all" || GROUP_OF[u.requires.building] === g).reduce((n, u) => n + home[u.id], 0);

  return (
    <div className="flex flex-col gap-2">
      <Card className="grid grid-cols-3 text-center divide-x divide-line/50 !py-2.5">
        <div>
          <div className="label !text-micro">ATTACK</div>
          <div className="font-bold"><GameIcon e="⚔️" /> {fmt(attackPower(state, home))}</div>
        </div>
        <div>
          <div className="label !text-micro">DEFENSE</div>
          <div className="font-bold"><GameIcon e="🛡️" /> {fmt(defensePower(state))}</div>
        </div>
        <div>
          <div className="label !text-micro">UPKEEP</div>
          <div className="font-bold text-bad">{rates.troopUpkeep ? `-${fmt(rates.troopUpkeep)}` : 0}/h</div>
        </div>
      </Card>

      {state.training.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h3 className="font-bold text-sm">
            Training{" "}
            <span className="text-muted font-bold text-xs">
              · {state.training.length} of {maxTrainBatches(state)} slots
            </span>
          </h3>
          {state.training.map((t) => (
            <TrainingRow key={t.startsAt} item={t} />
          ))}
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

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            className={clsx(
              "pill h-8 px-3 shrink-0",
              group === g.id ? "pill-gold !border-gold" : "text-muted"
            )}
            onClick={() => setGroup(g.id)}
          >
            {g.label} <span className="opacity-70">{fmt(countIn(g.id))}</span>
          </button>
        ))}
      </div>

      {unlocked.map((u) => (
        <UnitRow key={u.id} open={open === u.id} unit={u} onToggle={() => setOpen(open === u.id ? null : u.id)} />
      ))}
      {locked.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1">
          <div className="label px-1">Locked</div>
          {locked.map((u) => (
            <LockedRow key={u.id} unit={u} />
          ))}
        </div>
      )}
    </div>
  );
};
