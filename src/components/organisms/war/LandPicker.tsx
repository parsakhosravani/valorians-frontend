"use client";

import Image from "next/image";
import clsx from "clsx";

import { Button } from "@/components/atoms/Button";
import { GameIcon } from "@/components/atoms/GameIcon";
import { RESOURCES, useGame } from "@/context/resource/ResourceContext";
import { OUTPOST, ResourceId } from "@/lib/game/config";
import { outpostCost } from "@/lib/game/engine";
import { compact } from "@/lib/format";
import { TERRAIN } from "@/lib/game/map";
import { LAND_NAME, LandChoice } from "@/lib/game/outpost";

/** What the map gets back when choosing land (see landToChoose). */
export type LandData = {
  home: { x: number; y: number };
  choices: LandChoice[];
  move?: { index: number; from: { x: number; y: number }; cost: Record<ResourceId, number>; blocked: string | null };
};

const res = (id: ResourceId) => RESOURCES.find((r) => r.id === id)!;

/**
 * The card over the map while choosing land for an outpost: what to do
 * before a tile is picked, then that tile's land, ground and what settling
 * (or moving) there costs, with the button.
 */
export const LandPicker = ({
  data,
  chosen,
  busy,
  onSettle,
  onCancel,
}: {
  data: LandData | null;
  chosen: LandChoice | null;
  busy: boolean;
  onSettle: (c: LandChoice) => void;
  onCancel: () => void;
}) => {
  const { state } = useGame();
  const moving = data?.move;
  const cost = moving ? moving.cost : outpostCost(state).resources;
  const short = RESOURCES.some((r) => state.resources[r.id] < cost[r.id]);
  const strongholds = data?.choices.filter((c) => c.stronghold).length ?? 0;

  return (
    <div className="absolute inset-x-2 bottom-2 z-20 mr-14 rounded-xl px-3 py-2.5 bg-ink/95 border border-gold text-sm shadow-lg flex flex-col gap-2">
      {!chosen ? (
        <div className="flex items-center gap-2">
          <span className="text-lg animate-pulse">
            <GameIcon e="🏕️" />
          </span>
          <span className="flex-1 min-w-0 leading-tight">
            <b className="text-goldtext">{moving ? `Move outpost ${moving.index + 1}` : "Choose land for your outpost"}</b>
            <span className="block text-[11px] text-sub">
              {data == null
                ? "Looking for free land…"
                : data.choices.length === 0
                  ? "No free land near your village right now."
                  : `Tap one of the ${data.choices.length} marked tiles. The icon is what its land yields more of${strongholds ? "; a shield marks a stronghold" : ""}.`}
            </span>
          </span>
          <button className="btn btn-wood btn-sm shrink-0 font-sans font-extrabold text-xs" onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2.5">
            <span className="w-10 h-10 rounded-full bg-panel border border-gold/60 flex items-center justify-center shrink-0">
              <Image alt="" className="w-7 h-7 object-contain" src={res(chosen.land.resource).img} />
            </span>
            <span className="flex-1 min-w-0 leading-tight">
              <b className="font-display text-parch">{LAND_NAME[chosen.land.resource]}</b>
              <span className="block text-xs">
                <span className="text-goldtext font-bold">+{chosen.land.percent}% {res(chosen.land.resource).name.toLowerCase()}</span>
                <span className="text-muted"> · {chosen.distance} tiles from home</span>
              </span>
              <span className={clsx("block text-[11px]", chosen.stronghold ? "text-[#8FD1B8]" : "text-muted")}>
                {TERRAIN[chosen.terrain].name}
                {chosen.stronghold
                  ? ` · Stronghold: its garrison defends +${Math.round(OUTPOST.strongholdDefense * 100)}% (and +${Math.round(TERRAIN[chosen.terrain].defense * 100)}% from the ground)`
                  : " · Open ground: no defense bonus for its garrison"}
              </span>
            </span>
            <button aria-label="Close" className="text-muted text-lg leading-none px-1" onClick={onCancel}>
              ×
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] tabular-nums">
              {RESOURCES.map((r) => (
                <span key={r.id} className={clsx(state.resources[r.id] < cost[r.id] ? "text-bad" : "text-sub")}>
                  <Image alt={r.name} className="inline w-3.5 h-3.5 object-contain" src={r.img} /> {compact(cost[r.id])}
                </span>
              ))}
              {moving && <span className="text-muted w-full">Its fields lose a level each; it can move again in 3 days.</span>}
            </span>
            <Button disabled={busy || short || !!moving?.blocked} size="small" onClick={() => onSettle(chosen)}>
              {busy ? "Settling…" : moving ? "Move here" : "Settle here"}
            </Button>
          </div>
          {moving?.blocked && <span className="text-[11px] text-bad">{moving.blocked}</span>}
        </>
      )}
    </div>
  );
};
