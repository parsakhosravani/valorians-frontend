"use client";
import { useState } from "react";

import { Amount, ArtTile, Button, Card, LevelShield, Meter, Overline } from "@/components/ui";
import { BuildingArt } from "@/art";
import { RESOURCES, useGame } from "@/context";
import { BuildingDef, CROP_UPKEEP_PER_BUILDING_LEVEL, GROWTH_PER_BUILDING_LEVEL } from "@/lib/game/config";
import { buildingUpgradeInfo, getRates } from "@/lib/game/engine";
import { formatDuration } from "@/lib/format";

interface BuildingProps {
  building: BuildingDef;
  /** In the sheet the card drops its own frame. */
  bare?: boolean;
}

export const Building: React.FC<BuildingProps> = ({ building, bare }) => {
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

  let label = level === 0 ? "Build" : `Upgrade to level ${info.from + 1}`;
  let disabled = false;

  if (info.maxed) [label, disabled] = ["Max level", true];
  else if (!freeBuilder) [label, disabled] = ["All builders busy", true];
  else if (missing.length) [label, disabled] = [`Need more ${missing.map((m) => m.name.toLowerCase()).join(", ")}`, true];

  const body = (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <ArtTile size={bare ? 112 : 92} tone={level === 0 ? "locked" : "default"}>
          <BuildingArt className="absolute -inset-1 w-[calc(100%+8px)] h-[calc(100%+8px)]" id={building.id} level={level} />
          {level > 0 && <LevelShield className="absolute left-1 top-1" level={level} />}
        </ArtTile>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          {!bare && <h3 className="font-display font-bold text-display-md leading-tight">{building.name}</h3>}
          <p className="text-small text-parch-300">{building.description}</p>
          {!info.maxed && !inQueue && <Amount icon="time" size="xs" tone="muted" value={formatDuration(info.seconds * 1000)} />}
        </div>
      </div>

      {inQueue ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-small font-bold">
            <span>Building level {inQueue.toLevel}</span>
            <span className="text-parch-500">{formatDuration(inQueue.endsAt - now)} left</span>
          </div>
          <Meter max={inQueue.endsAt - inQueue.startedAt} tone="ember" value={now - inQueue.startedAt} />
        </div>
      ) : (
        !info.maxed && (
          <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-ink-950/50 border border-ink-600">
            <Overline>
              Cost · level {info.from} → {info.from + 1}
            </Overline>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {RESOURCES.map((r) => (
                <Amount key={r.id} icon={r.id} tone={state.resources[r.id] < info.cost ? "bad" : undefined} value={info.cost} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 text-caption font-bold text-parch-500">
              <span>
                Pop. growth <b className="text-moss-400">+{GROWTH_PER_BUILDING_LEVEL}/h</b>
              </span>
              <span>
                Crop upkeep <b className="text-blood-400">−{CROP_UPKEEP_PER_BUILDING_LEVEL}/h</b>
              </span>
            </div>
          </div>
        )
      )}

      {!inQueue && (
        <Button full disabled={disabled} loading={busy} size={bare ? "lg" : "md"} onClick={onUpgrade}>
          {label}
        </Button>
      )}
    </div>
  );

  return bare ? body : <Card>{body}</Card>;
};
