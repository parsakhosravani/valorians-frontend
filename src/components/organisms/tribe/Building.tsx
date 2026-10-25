"use client";
import { useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import time from "~/images/resources/time.webp";
import population from "~/images/resources/population.webp";

import { TextImage } from "@/components/molecules";
import { Button, Chip, Col, Row, Text } from "@/components";
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

  return (
    <Col className="bg-buildingBg rounded-2xl border border-line p-3">
      <Row className="relative gap-3">
        <Row className="-top-1.5 -left-1.5 absolute z-[1]">
          <Chip color="primary" label={String(level)} />
        </Row>
        <Image
          alt={building.name}
          className="h-[96px] w-[96px] object-contain shrink-0 bg-panel2 rounded-xl"
          height={110}
          src={buildingImage(building)}
          width={110}
        />
        <Col className="justify-center gap-2 flex-1 min-w-0">
          <Row className="justify-between items-center gap-2">
            <h2 className="font-display text-[17px] font-bold leading-tight">{building.name}</h2>
            {!info.maxed && !inQueue && (
              <TextImage imgAlt="time cost" imgSrc={time} size="small" title={formatDuration(info.seconds * 1000)} />
            )}
          </Row>
          <Text color="gray" size="small">
            {building.description}
          </Text>

          {inQueue ? (
            <Col className="gap-1">
              <Text size="small">
                Upgrading to level {inQueue.toLevel} · {formatDuration(inQueue.endsAt - now)} left
              </Text>
              <div className="h-2 w-full bg-panel2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gold to-ember rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, ((now - inQueue.startedAt) / (inQueue.endsAt - inQueue.startedAt)) * 100)}%`,
                  }}
                />
              </div>
            </Col>
          ) : (
            !info.maxed && (
              <Col className="gap-1">
                <Text color="gray" size="tiny">
                  Upgrade cost (level {info.from} → {info.from + 1})
                </Text>
                <Row className="flex-wrap gap-x-2 gap-y-1">
                  {RESOURCES.map((r) => (
                    <span
                      key={r.id}
                      className={clsx(state.resources[r.id] < info.cost && "text-[#F08A6C]")}
                    >
                      <TextImage imgAlt={r.name} imgSrc={r.img} size="small" title={compact(info.cost)} />
                    </span>
                  ))}
                  <TextImage
                    imgAlt="population growth"
                    imgSrc={population}
                    size="small"
                    title={`+${GROWTH_PER_BUILDING_LEVEL}/h`}
                  />
                  <span className="text-[#F08A6C]">
                    <TextImage
                      imgAlt="crop upkeep"
                      imgSrc={RESOURCES[3].img}
                      size="small"
                      title={`-${CROP_UPKEEP_PER_BUILDING_LEVEL}/h`}
                    />
                  </span>
                </Row>
              </Col>
            )
          )}
        </Col>
      </Row>
      {!inQueue && (
        <div className="mt-2">
          <Button isFull disabled={disabled} size="small" onClick={onUpgrade}>
            {label}
          </Button>
        </div>
      )}
    </Col>
  );
};
