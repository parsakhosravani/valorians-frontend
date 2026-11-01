"use client";

import React, { FunctionComponent, useMemo, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import builderImg from "~/images/resources/builder.webp";

import { Building } from "@/components/organisms/tribe/Building";
import { Drawer } from "@/components/molecules/Drawer";
import { InfoDrawer } from "@/components/organisms/InfoDrawer";
import { RESOURCES, useGame, useTelegramContext } from "@/context";
import { BUILDING_BY_ID, BuildingDef, RESOURCE_NAMES, ResourceId, buildingImage } from "@/lib/game/config";
import {
  BuildingGroup,
  GROUP_LABEL,
  UpgradeOption,
  buildingGroup,
  canStart,
  nextLevelGain,
  recommendUpgrade,
  upgradeOptions,
} from "@/lib/game/advice";
import { compact, formatDuration } from "@/lib/format";
import { Bar, SectionTitle } from "@/components/atoms/Ui";

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

/** "150 each" with the resources you are short of in red. */
const CostLine = ({ o }: { o: UpgradeOption }) => {
  const short = Object.entries(o.missing) as [ResourceId, number][];

  if (!short.length) {
    return (
      <span className="text-xs text-sub">
        {compact(o.cost)} each · {formatDuration(o.seconds * 1000)}
      </span>
    );
  }

  return (
    <span className="text-xs flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className="text-bad font-bold">Need</span>
      {short.map(([r, n]) => (
        <span key={r} className="inline-flex items-center gap-0.5 text-bad font-bold">
          <Image alt={RESOURCE_NAMES[r]} className="w-3.5 h-3.5" src={RES_IMG[r]} />
          {compact(n)}
        </span>
      ))}
      <span className="text-muted">
        {o.hoursToAfford === null ? "· upgrade storage first" : `· ready in ~${formatDuration(o.hoursToAfford * 3600e3)}`}
      </span>
    </span>
  );
};

const UpgradeRow = ({
  o,
  freeBuilder,
  onOpen,
  onUpgrade,
  busy,
}: {
  o: UpgradeOption;
  freeBuilder: boolean;
  onOpen: () => void;
  onUpgrade: () => void;
  busy: boolean;
}) => {
  const startable = canStart(o) && freeBuilder;

  return (
    <div className="card flex items-center gap-3 px-3 py-2.5">
      <button aria-label={`${o.building.name} details`} className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={onOpen}>
        <BuildingThumb b={o.building} level={o.level} />
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="font-bold leading-tight truncate">
            {o.building.name}
            <span className="text-muted font-bold text-xs">
              {"  "}
              {o.level} → {o.toLevel}
            </span>
          </span>
          <span className="text-xs font-bold text-good truncate">{nextLevelGain(o.building, o.level)}</span>
          {!o.job && <CostLine o={o} />}
        </span>
      </button>
      {startable ? (
        <button className="btn btn-sm btn-gold shrink-0" disabled={busy} onClick={onUpgrade}>
          {o.level === 0 ? "Build" : "Upgrade"}
        </button>
      ) : canStart(o) && !freeBuilder ? (
        <span className="shrink-0 text-[11px] font-bold text-muted text-right leading-tight w-16">Builders busy</span>
      ) : null}
    </div>
  );
};

type Job = { building: string; toLevel: number; startedAt: number; endsAt: number };

/**
 * What each builder is doing: work under way with its timer, then the free
 * ones, each offered the next job it could start (`picks`, best first) with a
 * one-tap button, or, when nothing is affordable, what to save up for.
 */
const BuilderRows = ({
  jobs,
  free,
  now,
  picks,
  saving,
  busy,
  thumb = 44,
  onOpen,
  onUpgrade,
}: {
  jobs: Job[];
  free: number;
  now: number;
  picks: (UpgradeOption & { why?: string })[];
  saving: UpgradeOption | null;
  busy: string | null;
  thumb?: number;
  onOpen: (b: BuildingDef) => void;
  onUpgrade: (id: string) => void;
}) => (
  <>
    {jobs.map((j) => {
      const b = BUILDING_BY_ID[j.building];

      return (
        <button key={j.building} className="flex items-center gap-3 text-left" onClick={() => onOpen(b)}>
          <BuildingThumb b={b} level={j.toLevel - 1} size={thumb} />
          <span className="flex-1 min-w-0 flex flex-col gap-1">
            <span className="flex justify-between gap-2 text-sm font-bold">
              <span className="truncate">
                {b.name} → {j.toLevel}
              </span>
              <span className="text-goldtext shrink-0">{formatDuration(j.endsAt - now)}</span>
            </span>
            <Bar max={j.endsAt - j.startedAt} value={now - j.startedAt} />
          </span>
        </button>
      );
    })}
    {Array.from({ length: Math.max(0, free) }, (_, i) => {
      const o = picks[i];

      if (o)
        return (
          <div key={i} className="rounded-xl border border-gold/60 bg-gold/10 flex items-center gap-3 px-2.5 py-2">
            <button aria-label={`${o.building.name} details`} className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => onOpen(o.building)}>
              <BuildingThumb b={o.building} level={o.level} size={thumb} />
              <span className="flex flex-col min-w-0">
                <span className="text-micro font-extrabold text-good uppercase tracking-wide">
                  Free builder{o.why ? `: ${o.why}` : ""}
                </span>
                <span className="font-bold leading-tight truncate">
                  {o.building.name} <span className="text-muted text-xs">→ {o.toLevel}</span>
                </span>
                <span className="text-xs text-sub truncate">
                  {nextLevelGain(o.building, o.level)}, {compact(o.cost)} each
                </span>
              </span>
            </button>
            <button className="btn btn-sm btn-gold shrink-0" disabled={busy === o.building.id} onClick={() => onUpgrade(o.building.id)}>
              {o.level === 0 ? "Build" : "Upgrade"}
            </button>
          </div>
        );

      return (
        <div key={i} className="inset flex items-center gap-3 border-dashed !border-gold/50 px-3 py-2 text-sm text-sub">
          <span className="w-2 h-2 rounded-full bg-good shadow-[0_0_6px_rgba(157,208,127,0.8)] shrink-0" />
          {saving ? (
            <span className="min-w-0">
              Free builder. Next up: <b className="text-parch">{saving.building.name}</b>,{" "}
              {saving.hoursToAfford === null
                ? "after a bigger warehouse"
                : `affordable in about ${formatDuration(saving.hoursToAfford * 3600e3)}`}
            </span>
          ) : (
            "Free builder"
          )}
        </div>
      );
    })}
  </>
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

  const ready = options.filter((o) => canStart(o) && o.building.id !== advice?.id).sort((a, b) => a.cost - b.cost);
  const best0 = advice ? options.find((o) => o.building.id === advice.id) ?? null : null;
  // Idle builders get the next jobs right in their slot: the best one first, then the cheapest ready.
  const picks = freeBuilders > 0 ? [...(best0 && canStart(best0) ? [{ ...best0, why: advice!.reason }] : []), ...ready].slice(0, freeBuilders) : [];
  const picked = new Set(picks.map((o) => o.building.id));
  // Nothing to start: what to save up for, the soonest affordable.
  const saving =
    options
      .filter((o) => !o.job && !canStart(o) && o.hoursToAfford !== null)
      .sort((a, b) => (a.hoursToAfford ?? 1e9) - (b.hoursToAfford ?? 1e9))[0] ?? null;
  const nextFree = jobs.length ? jobs[0].endsAt : null;
  // Everything not being built: ready ones first (cheapest), then closest to affordable.
  const rank = (o: UpgradeOption) => (canStart(o) ? 0 : 1);
  const rest = options
    .filter((o) => !o.job)
    .filter((o) => filter === "all" || buildingGroup(o.building) === filter)
    .sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? a.cost - b.cost : (a.hoursToAfford ?? 1e9) - (b.hoursToAfford ?? 1e9)));
  const best = advice ? options.find((o) => o.building.id === advice.id)! : null;

  const upgrade = async (id: string) => {
    setBusy(id);
    const ok = await upgradeBuilding(id);

    setBusy(null);
    if (ok) telegram?.WebApp.HapticFeedback.notificationOccurred("success");
  };


  const drawer = (
    <Drawer isOpen={!!open} position="bottom" onClose={() => setOpen(null)}>
      {open && (
        <div className="pt-1">
          <Building building={open} />
        </div>
      )}
    </Drawer>
  );

  return (
    <div className="w-full mx-auto px-3 pt-1 pb-4 flex flex-col gap-4 max-w-md">
      {/* One column that never grows past the screen: a long line in a card can't push it wider. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 w-full items-stretch">
        {/* Builders and what they are doing */}
        <section
          className={clsx(
            "card p-3 flex flex-col gap-2.5",
            picks.length > 0 && "!border-gold/80 shadow-[0_0_18px_rgba(227,169,72,0.25)]"
          )}
        >
          <div className="flex items-center gap-2">
            <Image alt="" className="w-6 h-6" src={builderImg} />
            <h2 className="title-section flex-1">
              Builders{" "}
              <span className="text-muted text-xs font-sans font-bold normal-case tracking-normal">
                {freeBuilders} of {rates.builders} free
              </span>
            </h2>
            <InfoDrawer
              content="Each builder works on one building at a time. Upgrade your Town Hall to hire another builder every 5 levels, and to build faster."
              title="Builders"
            />
          </div>
          {picks.length > 0 && (
            <p className="text-sm font-bold text-goldtext -mt-1">
              {picks.length === 1 ? "A builder is" : `${picks.length} builders are`} waiting for work. Tap to start.
            </p>
          )}
          <BuilderRows
            busy={busy}
            free={freeBuilders}
            jobs={jobs}
            now={now}
            picks={picks}
            saving={saving}
            onOpen={setOpen}
            onUpgrade={upgrade}
          />
          {freeBuilders <= 0 && nextFree && (
            <p className="text-xs text-muted">A builder is free again in {formatDuration(nextFree - now)}.</p>
          )}
        </section>

        {/* The one best next step */}
        {best && advice && !picked.has(best.building.id) && (
          <section className="card-hero p-3 flex flex-col gap-2.5">
            <span className="pill-gold pill self-start text-micro tracking-[0.12em]">BEST NEXT STEP · {advice.reason.toUpperCase()}</span>
            <div className="flex flex-col gap-2.5">
              <button className="flex items-center gap-3 text-left flex-1 min-w-0" onClick={() => setOpen(best.building)}>
                <BuildingThumb b={best.building} level={best.level} size={68} />
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-display font-black text-[19px] leading-tight">
                    {best.building.name} <span className="text-muted text-sm font-sans">→ {best.toLevel}</span>
                  </span>
                  <span className="text-sm font-bold text-good">{nextLevelGain(best.building, best.level)}</span>
                  <CostLine o={best} />
                </span>
              </button>
              <button className="btn btn-gold btn-lg w-full" disabled={busy === best.building.id} onClick={() => upgrade(best.building.id)}>
                {best.level === 0 ? "Build" : "Upgrade"} {best.building.name}
              </button>
            </div>
          </section>
        )}
      </div>

      <div className="flex flex-col gap-4 min-w-0">
        <SectionTitle>All buildings</SectionTitle>

        {/* A few quick wins you can start right now */}
        {ready.some((o) => !picked.has(o.building.id)) && (
          <section className="flex flex-col gap-2">
            <SectionTitle right={`${ready.length} ready`}>Quick upgrades</SectionTitle>
            {ready.filter((o) => !picked.has(o.building.id)).slice(0, 3).map((o) => (
              <UpgradeRow
                key={o.building.id}
                busy={busy === o.building.id}
                freeBuilder={freeBuilders > 0}
                o={o}
                onOpen={() => setOpen(o.building)}
                onUpgrade={() => upgrade(o.building.id)}
              />
            ))}
          </section>
        )}

        {/* Every building, filterable */}
        <section className="flex flex-col gap-2">
          <div className="flex gap-1.5 overflow-x-auto scrollable -mx-3 px-3">
            {(["all", "economy", "military", "defense"] as Filter[]).map((f) => (
              <button
                key={f}
                className={clsx("pill h-8 px-3.5 text-sm shrink-0", filter === f ? "pill-gold !border-gold" : "text-sub")}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : GROUP_LABEL[f]}
              </button>
            ))}
          </div>
          {rest.map((o) => (
            <UpgradeRow
              key={o.building.id}
              busy={busy === o.building.id}
              freeBuilder={freeBuilders > 0}
              o={o}
              onOpen={() => setOpen(o.building)}
              onUpgrade={() => upgrade(o.building.id)}
            />
          ))}
          {rest.length === 0 && <p className="text-sm text-muted">Nothing else here right now.</p>}
        </section>

        {drawer}
      </div>
    </div>
  );
};
