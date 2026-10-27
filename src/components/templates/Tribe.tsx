"use client";

import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import builderImg from "~/images/resources/builder.webp";

import { Building, Drawer, InfoDrawer } from "@/components";
import { Village } from "@/components/organisms/tribe/Village";
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
import { Bar, Segmented, SectionTitle } from "@/components/atoms/Ui";

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
            {!o.maxed && (
              <span className="text-muted font-bold text-xs">
                {"  "}
                {o.level} → {o.toLevel}
              </span>
            )}
          </span>
          <span className="text-xs font-bold text-good truncate">{o.maxed ? "Max level" : nextLevelGain(o.building)}</span>
          {!o.maxed && !o.job && <CostLine o={o} />}
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

type Filter = "all" | BuildingGroup;
type View = "village" | "list";

const VIEW_KEY = "tribe-view";

export const Tribe: FunctionComponent = () => {
  const { telegram } = useTelegramContext();
  const { state, rates, now, upgradeBuilding } = useGame();
  const [open, setOpen] = useState<BuildingDef | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<View>("village");

  // Remember Village / List for this player.
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "list") setView("list");
    } catch {
      /* storage blocked: stay on the village */
    }
  }, []);

  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const options = useMemo(() => upgradeOptions(state), [state]);
  const advice = useMemo(() => recommendUpgrade(state, options), [state, options]);
  const freeBuilders = rates.builders - state.queue.length;
  const jobs = [...state.queue].sort((a, b) => a.endsAt - b.endsAt);

  const ready = options.filter((o) => canStart(o) && o.building.id !== advice?.id).sort((a, b) => a.cost - b.cost);
  // Everything not being built: ready ones first (cheapest), then closest to affordable, maxed last.
  const rank = (o: UpgradeOption) => (o.maxed ? 2 : canStart(o) ? 0 : 1);
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

  return (
    <div
      className={clsx(
        "w-full mx-auto px-3 pt-1 pb-4",
        // On a wide window (Telegram Desktop) the village takes the room and builders sit beside it.
        view === "village" ? "max-w-6xl lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-5 lg:items-start" : "max-w-md",
      )}
    >
      {/* Only stick beside the village on wide screens; in the single-column list it would slide under the cards. */}
      <div className={clsx("flex flex-col gap-4 w-full max-w-md mx-auto", view === "village" && "lg:max-w-none lg:sticky lg:top-1")}>
        {/* Builders and what they are doing */}
        <section className="card p-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <Image alt="" className="w-6 h-6" src={builderImg} />
            <h2 className="title-section flex-1">
              Builders{" "}
              <span className="text-muted text-xs font-sans font-bold normal-case tracking-normal">
                {freeBuilders} of {rates.builders} free
              </span>
            </h2>
            <InfoDrawer
              content="Each builder works on one building at a time. Upgrade your Town Hall to hire more builders at levels 5, 10 and 15, and to build faster."
              title="Builders"
            />
          </div>
          {jobs.map((j) => {
            const b = BUILDING_BY_ID[j.building];

            return (
              <button key={j.building} className="flex items-center gap-3 text-left" onClick={() => setOpen(b)}>
                <BuildingThumb b={b} level={j.toLevel - 1} size={44} />
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
          {Array.from({ length: Math.max(0, freeBuilders) }, (_, i) => (
            <div key={i} className="inset flex items-center gap-3 border-dashed !border-gold/50 px-3 py-2 text-sm text-sub">
              <span className="w-2 h-2 rounded-full bg-good shadow-[0_0_6px_rgba(157,208,127,0.8)]" />
              Free builder · {advice ? "start the upgrade below" : ready.length ? "pick an upgrade below" : "save up for an upgrade"}
            </div>
          ))}
        </section>

        {/* The one best next step */}
        {best && advice && (
          <section className="card-hero p-3 flex flex-col gap-2.5">
            <span className="pill-gold pill self-start text-micro tracking-[0.12em]">BEST NEXT STEP · {advice.reason.toUpperCase()}</span>
            <button className="flex items-center gap-3 text-left" onClick={() => setOpen(best.building)}>
              <BuildingThumb b={best.building} level={best.level} size={68} />
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className="font-display font-black text-[19px] leading-tight">
                  {best.building.name} <span className="text-muted text-sm font-sans">→ {best.toLevel}</span>
                </span>
                <span className="text-sm font-bold text-good">{nextLevelGain(best.building)}</span>
                <CostLine o={best} />
              </span>
            </button>
            <button className="btn btn-gold btn-lg w-full" disabled={busy === best.building.id} onClick={() => upgrade(best.building.id)}>
              {best.level === 0 ? "Build" : "Upgrade"} {best.building.name}
            </button>
          </section>
        )}
      </div>

      <div className="flex flex-col gap-4 mt-4 lg:mt-0 min-w-0">
        {/* Village / List switch */}
        <SectionTitle
          right={
            <Segmented
              className="!w-auto !p-0.5 [&_.seg-btn]:h-7 [&_.seg-btn]:px-3.5 [&_.seg-btn]:text-xs"
              tabs={[
                { id: "village" as View, label: "Village" },
                { id: "list" as View, label: "List" },
              ]}
              value={view}
              onChange={pickView}
            />
          }
        >
          {view === "village" ? "Your village" : "All buildings"}
        </SectionTitle>

        {view === "village" && <Village freeBuilder={freeBuilders > 0} now={now} options={options} onOpen={setOpen} />}

        {/* A few quick wins you can start right now */}
        {view === "list" && ready.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionTitle right={`${ready.length} ready`}>Quick upgrades</SectionTitle>
            {ready.slice(0, 3).map((o) => (
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
        {view === "list" && (
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
        )}

        <Drawer isOpen={!!open} position="bottom" onClose={() => setOpen(null)}>
          {open && (
            <div className="pt-1">
              <Building building={open} />
            </div>
          )}
        </Drawer>
      </div>
    </div>
  );
};
