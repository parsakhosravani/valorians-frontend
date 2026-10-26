"use client";
import { useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import time from "~/images/resources/time.webp";
import { SectionTitle } from "@/components/atoms/Ui";
import population from "~/images/resources/population.webp";

import { Button, Chip } from "@/components";
import { RESOURCES, useGame } from "@/context";
import {
  BuildingDef,
  CROP_UPKEEP_PER_BUILDING_LEVEL,
  GROWTH_PER_BUILDING_LEVEL,
  buildingImage,
} from "@/lib/game/config";
import { buildingUpgradeInfo, getRates } from "@/lib/game/engine";
import { compact, formatDuration } from "@/lib/format";

interface BuildingProps {
  building: BuildingDef;
}

export const Building: React.FC<BuildingProps> = ({ building }) => {
  const { state, now, upgradeBuilding } = useGame();
  const [busy, setBusy] = useState(false);

  const level = state.buildings[building.id] ?? 0;
  const inQueue = state.queue.find((q) => q.building === building.id);
  const info = buildingUpgradeInfo(state, building.id);
  const freeBuilder = state.queue.length < getRates(state).builders;
  const missing = RESOURCES.filter((r) => state.resources[r.id] < info.cost);

  const onUpgrade = async () => {
    setBusy(true);
    await upgradeBuilding(building.id);
    setBusy(false);
  };

  let label = "Upgrade";
  let disabled = busy;

  if (info.maxed) [label, disabled] = ["Max level", true];
  else if (!freeBuilder) [label, disabled] = ["No free builder", true];
  else if (missing.length) [label, disabled] = [`Need more ${missing.map((m) => m.name).join(", ")}`, true];

  const progress = inQueue ? Math.min(1, (now - inQueue.startedAt) / (inQueue.endsAt - inQueue.startedAt)) : 0;

  return (
    <div className="flex flex-col gap-3 pt-1">
      {/* Art and name */}
      <div className="relative flex flex-col items-center text-center gap-1">
        <span aria-hidden className="absolute top-2 w-44 h-28 rounded-full bg-gold/15 blur-2xl" />
        <Image
          alt={building.name}
          className="relative h-[132px] w-[132px] object-contain drop-shadow-[0_8px_10px_rgba(0,0,0,0.6)]"
          height={264}
          src={buildingImage(building)}
          width={264}
        />
        <div className="relative flex items-center gap-2">
          <Chip color="primary" label={String(level)} />
          <h2 className="title-screen !text-[21px]">{building.name}</h2>
        </div>
        <p className="relative text-[13px] text-sub leading-snug max-w-[300px]">{building.description}</p>
      </div>

      {inQueue ? (
        <div className="inset p-3 flex flex-col gap-2">
          <div className="flex justify-between text-sm font-bold">
            <span>Upgrading to level {inQueue.toLevel}</span>
            <span className="text-goldtext tabular-nums">{formatDuration(inQueue.endsAt - now)}</span>
          </div>
          <div className="bar"><span className="bar-fill" style={{ width: `${progress * 100}%` }} /></div>
        </div>
      ) : (
        !info.maxed && (
          <div className="flex flex-col gap-2">
            <SectionTitle right={<span className="flex items-center gap-1"><Image alt="" className="w-3.5 h-3.5 rounded-sm" src={time} />{formatDuration(info.seconds * 1000)}</span>}>
              Level {info.from} → {info.from + 1}
            </SectionTitle>
            <div className="inset grid grid-cols-4 divide-x divide-line/50 py-2">
              {RESOURCES.map((r) => {
                const short = state.resources[r.id] < info.cost;

                return (
                  <span key={r.id} className="flex flex-col items-center gap-0.5">
                    <Image alt={r.name} className="w-6 h-6 object-contain" src={r.img} />
                    <span className={clsx("text-xs font-extrabold tabular-nums", short ? "text-bad" : "text-parch")}>{compact(info.cost)}</span>
                  </span>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="pill pill-good">
                <Image alt="" className="w-3.5 h-3.5 rounded-sm" src={population} />+{GROWTH_PER_BUILDING_LEVEL}/h people
              </span>
              <span className="pill pill-bad">
                <Image alt="" className="w-3.5 h-3.5" src={RESOURCES[3].img} />−{CROP_UPKEEP_PER_BUILDING_LEVEL}/h crop
              </span>
            </div>
          </div>
        )
      )}

      {!inQueue && (
        <Button isFull disabled={disabled} size="large" onClick={onUpgrade}>
          {label}
        </Button>
      )}
    </div>
  );
};
