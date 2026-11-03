"use client";

import React, { FunctionComponent, useMemo, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import builderImg from "~/images/resources/builder.webp";

import { Building } from "@/components/organisms/tribe/Building";
import { Outposts } from "@/components/organisms/tribe/Outposts";
import { Drawer } from "@/components/molecules/Drawer";
import { InfoDrawer } from "@/components/organisms/InfoDrawer";
import { RESOURCES, useGame, useTelegramContext } from "@/context";
import { BUILDING_BY_ID, BuildingDef, RESOURCE_NAMES, ResourceId, buildingImage, costTotal } from "@/lib/game/config";
import {
  BuildingGroup,
  GROUP_LABEL,
  UpgradeOption,
  buildingGroup,
  canStart,
  recommendUpgrade,
  upgradeOptions,
} from "@/lib/game/advice";
import { compact, formatDuration } from "@/lib/format";
import { Bar, SectionTitle, Segmented } from "@/components/atoms/Ui";

const RES_IMG = Object.fromEntries(RESOURCES.map((r) => [r.id, r.img])) as Record<ResourceId, (typeof RESOURCES)[number]["img"]>;

const BuildingThumb = ({ b, level, size = 52 }: { b: BuildingDef; level: number; size?: number }) => (
  <div className="relative shrink-0" style={{ width: size, height: size }}>
    <Image
      alt=""
      className={clsx("w-full h-full object-contain drop-shadow-[0_3px_4px_rgba(0,0,0,0.55)]", level === 0 && "opacity-50 grayscale")}
      height={size * 2}
      src={buildingImage(b)}
      width={size * 2}
    />
    <span className="absolute -top-1 -left-1 min-w-[22px] h-[22px] px-1 rounded-full bg-gradient-to-b from-goldhi to-gold border border-golddeep text-[#1A120B] font-display font-black text-[11px] flex items-center justify-center shadow">
      {level}
    </span>
  </div>
);

/**
 * One short status line for a building you can't start yet, or what it costs
 * when you can: kept to a single line so the list reads at a glance.
 */
const StatusLine = ({ o }: { o: UpgradeOption }) => {
  const short = Object.entries(o.missing) as [ResourceId, number][];

  if (o.blocked) return <span className="text-xs text-muted truncate">{o.blocked}</span>;
  if (!short.length) {
    return (
      <span className="text-xs text-muted tabular-nums truncate">
        {compact(costTotal(o.cost))} in all · {formatDuration(o.seconds * 1000)}
      </span>
    );
  }

  return (
    <span className="text-xs flex items-center gap-1.5 min-w-0 tabular-nums">
      {short.map(([r, n]) => (
        <span key={r} className="inline-flex items-center gap-0.5 text-bad font-bold shrink-0">
          <Image alt={RESOURCE_NAMES[r]} className="w-3.5 h-3.5" src={RES_IMG[r]} />
          {compact(n)}
        </span>
      ))}
      <span className="text-muted truncate">
        {o.hoursToAfford === null ? "needs more storage" : `~${formatDuration(o.hoursToAfford * 3600e3)}`}
      </span>
    </span>
  );
};

/** One building in the list: picture, name and level, one status line, and a button only when it can start now. */
const UpgradeRow = ({
  o,
  best,
  freeBuilder,
  onOpen,
  onUpgrade,
  busy,
}: {
  o: UpgradeOption;
  best: boolean;
  freeBuilder: boolean;
  onOpen: () => void;
  onUpgrade: () => void;
  busy: boolean;
}) => {
  const startable = canStart(o) && freeBuilder;

  return (
    <div className={clsx("flex items-center gap-3 px-2.5 py-2 rounded-xl", best ? "card-hero !shadow-none" : "card-flat")}>
      <button aria-label={`${o.building.name} details`} className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={onOpen}>
        <BuildingThumb b={o.building} level={o.level} size={44} />
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold leading-tight truncate">{o.building.name}</span>
            {best && <span className="pill pill-gold h-5 px-1.5 text-micro shrink-0">BEST</span>}
          </span>
          <StatusLine o={o} />
        </span>
      </button>
      {startable && (
        <button className="btn btn-sm btn-gold shrink-0" disabled={busy} onClick={onUpgrade}>
          {o.level === 0 ? "Build" : "Upgrade"}
        </button>
      )}
    </div>
  );
};

type Job = { building: string; toLevel: number; startedAt: number; endsAt: number };

/**
 * The builders as a row of small slots instead of a stack of big rows:
 * busy ones show the building, a thin bar and the time left; a free one
 * offers its best job with one button, or just says it is free.
 */
const BuilderSlots = ({
  jobs,
  free,
  now,
  picks,
  busy,
  onOpen,
  onUpgrade,
}: {
  jobs: Job[];
  free: number;
  now: number;
  picks: UpgradeOption[];
  busy: string | null;
  onOpen: (b: BuildingDef) => void;
  onUpgrade: (id: string) => void;
}) => (
  <div className="grid grid-cols-4 gap-2">
    {jobs.map((j) => {
      const b = BUILDING_BY_ID[j.building];

      return (
        <button key={j.building} className="inset flex flex-col items-center gap-1 px-1.5 pt-2 pb-1.5 min-w-0" onClick={() => onOpen(b)}>
          <BuildingThumb b={b} level={j.toLevel - 1} size={40} />
          <span className="text-[11px] font-bold leading-tight truncate w-full text-center">{b.name}</span>
          <Bar className="!h-1.5" max={j.endsAt - j.startedAt} value={now - j.startedAt} />
          <span className="text-[11px] font-bold text-goldtext tabular-nums leading-none">{formatDuration(j.endsAt - now)}</span>
        </button>
      );
    })}
    {Array.from({ length: Math.max(0, free) }, (_, i) => {
      const o = picks[i];

      if (o)
        return (
          <div key={i} className="rounded-xl border border-gold/70 bg-gold/10 flex flex-col items-center gap-1 px-1.5 pt-2 pb-1.5 min-w-0">
            <button aria-label={`${o.building.name} details`} className="flex flex-col items-center gap-1 w-full min-w-0" onClick={() => onOpen(o.building)}>
              <BuildingThumb b={o.building} level={o.level} size={40} />
              <span className="text-[11px] font-bold leading-tight truncate w-full text-center">{o.building.name}</span>
            </button>
            <button className="btn btn-gold !h-6 !px-0 w-full !text-[11px] !rounded-lg" disabled={busy === o.building.id} onClick={() => onUpgrade(o.building.id)}>
              {o.level === 0 ? "Build" : "Start"}
            </button>
          </div>
        );

      return (
        <div key={i} className="rounded-xl border border-dashed border-gold/40 flex flex-col items-center justify-center gap-1 py-2 min-h-[96px]">
          <span className="w-2 h-2 rounded-full bg-good shadow-[0_0_6px_rgba(157,208,127,0.8)]" />
          <span className="text-[11px] font-bold text-sub">Free</span>
        </div>
      );
    })}
  </div>
);

type Filter = "all" | BuildingGroup;
export const Tribe: FunctionComponent = () => {
  const { telegram } = useTelegramContext();
  const { state, rates, now, upgradeBuilding } = useGame();
  const [open, setOpen] = useState<BuildingDef | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const options = useMemo(() => upgradeOptions(state), [state]);
  const advice = useMemo(() => recommendUpgrade(state, options), [state, options]);
  const freeBuilders = rates.builders - state.queue.length;
  const jobs = [...state.queue].sort((a, b) => a.endsAt - b.endsAt);

  const ready = options.filter((o) => canStart(o) && o.building.id !== advice?.id).sort((a, b) => costTotal(a.cost) - costTotal(b.cost));
  const best = advice ? options.find((o) => o.building.id === advice.id) ?? null : null;
  // Idle builders get the next jobs right in their slot: the best one first, then the cheapest ready.
  const picks = freeBuilders > 0 ? [...(best && canStart(best) ? [best] : []), ...ready].slice(0, freeBuilders) : [];
  const picked = new Set(picks.map((o) => o.building.id));
  // Nothing to start: what to save up for, the soonest affordable.
  const saving =
    options
      .filter((o) => !o.job && !canStart(o) && o.hoursToAfford !== null)
      .sort((a, b) => (a.hoursToAfford ?? 1e9) - (b.hoursToAfford ?? 1e9))[0] ?? null;
  const nextFree = jobs.length ? jobs[0].endsAt : null;
  // Everything not being built or already offered in a builder slot: the advised
  // one first, then ready ones (cheapest), then closest to affordable.
  const rank = (o: UpgradeOption) => (o.building.id === best?.building.id ? -1 : canStart(o) ? 0 : 1);
  const rest = options
    .filter((o) => !o.job && !picked.has(o.building.id))
    .filter((o) => filter === "all" || buildingGroup(o.building) === filter)
    .sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? costTotal(a.cost) - costTotal(b.cost) : (a.hoursToAfford ?? 1e9) - (b.hoursToAfford ?? 1e9)));

  const upgrade = async (id: string) => {
    setBusy(id);
    const ok = await upgradeBuilding(id);

    setBusy(null);
    if (ok) telegram?.WebApp.HapticFeedback.notificationOccurred("success");
  };

  return (
    <div className="w-full mx-auto px-3 pt-1 pb-4 flex flex-col gap-5 max-w-md min-w-0">
      {/* Builders: one compact row of slots */}
      <section className="flex flex-col gap-2.5 min-w-0">
        <div className="flex items-center gap-2">
          <Image alt="" className="w-5 h-5" src={builderImg} />
          <h2 className="title-section flex-1">Builders</h2>
          <span className="text-xs font-bold text-muted tabular-nums">
            {freeBuilders > 0
              ? `${freeBuilders} of ${rates.builders} free`
              : nextFree
                ? `next free in ${formatDuration(nextFree - now)}`
                : ""}
          </span>
          <InfoDrawer
            content="Each builder works on one building at a time. Upgrade your Town Hall to build faster and to hire a second builder at level 10 and a third at 20. No building can be higher than the Town Hall (mines and the Warehouse may be 2 levels ahead)."
            title="Builders"
          />
        </div>
        <BuilderSlots busy={busy} free={freeBuilders} jobs={jobs} now={now} picks={picks} onOpen={setOpen} onUpgrade={upgrade} />
        {freeBuilders > picks.length && saving && (
          <p className="text-xs text-muted">
            Saving for <b className="text-sub">{saving.building.name}</b>, ready in ~{formatDuration((saving.hoursToAfford ?? 0) * 3600e3)}.
          </p>
        )}
      </section>

      {/* Every building, filterable */}
      <section className="flex flex-col gap-2.5 min-w-0">
        <SectionTitle>Buildings</SectionTitle>
        <Segmented
          tabs={(["all", "economy", "military", "defense"] as Filter[]).map((f) => ({ id: f, label: f === "all" ? "All" : GROUP_LABEL[f] }))}
          value={filter}
          onChange={setFilter}
        />
        <div className="flex flex-col gap-1.5">
          {rest.map((o) => (
            <UpgradeRow
              key={o.building.id}
              best={o.building.id === best?.building.id}
              busy={busy === o.building.id}
              freeBuilder={freeBuilders > 0}
              o={o}
              onOpen={() => setOpen(o.building)}
              onUpgrade={() => upgrade(o.building.id)}
            />
          ))}
          {rest.length === 0 && <p className="text-sm text-muted">Nothing else here right now.</p>}
        </div>
      </section>

      {/* Outposts open up at Town Hall 10; until then they'd only be a promise. */}
      {(rates.builders > 1 || state.outposts.length > 0 || (state.buildings["town-hall"] ?? 0) >= 8) && <Outposts />}

      <Drawer isOpen={!!open} position="bottom" onClose={() => setOpen(null)}>
        {open && (
          <div className="pt-1">
            <Building building={open} />
          </div>
        )}
      </Drawer>
    </div>
  );
};
