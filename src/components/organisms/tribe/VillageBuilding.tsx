"use client";
import clsx from "clsx";
import { CSSProperties, memo, useId } from "react";

import { BuildingDef, buildingImage } from "@/lib/game/config";
import { UpgradeOption, canStart } from "@/lib/game/advice";
import { formatDuration } from "@/lib/format";

/**
 * A building of yours drawn on the map, as the war map shows your village
 * when you zoom in on it (see HomeVillage): its art on its plot, a level
 * medallion and name plate at its foot, and over its roof a gem when an
 * upgrade is ready or the work under way.
 */

type Point = { x: number; y: number };

/**
 * A building's width on the ground (px at zoom 1); a few landmarks are bigger.
 * Kept a little under the plot spacing so, with the whole village in view,
 * there's room between buildings for their names.
 */
export const SIZE = 33;

export const BIG: Record<string, number> = { "town-hall": 1.5, "city-gate": 1.15, watchtower: 1.1 };

/**
 * Below this zoom the buildings are small on screen: their name plates shrink
 * to fit (see plateSize), and any that would still cover another wait for
 * you to zoom in.
 */
export const COMPACT_ZOOM = 1.45;

// ─── Buildings ───────────────────────────────────────────────────────────────

/**
 * The "upgrade now" mark: a green gem with a gold rim and a raised double
 * chevron, gently bobbing so ready buildings catch the eye.
 */
export const UpgradeMark = ({ className, style }: { className?: string; style?: CSSProperties }) => {
  const id = useId().replace(/:/g, "");

  return (
    <svg aria-hidden="true" className={clsx("animate-nudge drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]", className)} style={style} viewBox="0 0 24 24">
      <defs>
        <radialGradient cx="38%" cy="30%" id={`${id}-gem`} r="75%">
          <stop offset="0" stopColor="#D8F5B8" />
          <stop offset="0.45" stopColor="#6FB548" />
          <stop offset="1" stopColor="#2E5A1C" />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#FBE3A6" />
          <stop offset="1" stopColor="#9A6A26" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" fill={`url(#${id}-rim)`} r="11.5" />
      <circle cx="12" cy="12" fill={`url(#${id}-gem)`} r="9.6" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.5 12.2 12 7.7l4.5 4.5M7.5 16.6 12 12.1l4.5 4.5" stroke="#1C3410" strokeWidth="4" />
        <path d="M7.5 12.2 12 7.7l4.5 4.5M7.5 16.6 12 12.1l4.5 4.5" stroke="#FFFBEA" strokeWidth="2.2" />
      </g>
      <ellipse cx="9" cy="6.6" fill="#fff" opacity="0.35" rx="3.2" ry="1.4" transform="rotate(-25 9 6.6)" />
    </svg>
  );
};

/**
 * Something that keeps one size on screen at any zoom, pinned to a point on
 * the ground: the camera's layer carries the zoom in --vz (set when the
 * camera comes to rest), and this undoes it round the point.
 */
const OnScreen = ({ x, y, z, children }: { x: number; y: number; z: number; children: React.ReactNode }) => (
  <div className="absolute w-0 h-0 pointer-events-none" style={{ left: x, top: y, zIndex: z, scale: "calc(1 / var(--vz, 1))", transformOrigin: "0 0" }}>
    {children}
  </div>
);

type PlotProps = {
  o: UpgradeOption;
  at: Point;
  freeBuilder: boolean;
  now: number;
  named: boolean;
  /** Zoomed out: smaller plates, and no level medallion unless it's named. */
  compact: boolean;
  onOpen: (b: BuildingDef) => void;
};

/** A building on its plot: the art (zooms with the land), a level medallion and name at its foot, and what's going on over its roof. */
export const VillageBuilding = memo(function Building({ o, at, freeBuilder, now, named, compact, onOpen }: PlotProps) {
  const size = SIZE * (BIG[o.building.id] ?? 1);
  const built = o.level > 0;
  const ready = !o.job && freeBuilder && canStart(o);
  // The gem is for upgrading what stands; an empty plot you can build on shows a green "+".
  const gem = ready && built;
  const progress = o.job ? Math.min(1, (now - o.job.startedAt) / (o.job.endsAt - o.job.startedAt)) : 0;
  // Nearer buildings (lower on screen) stand in front.
  const depth = Math.round(at.y * 10);

  return (
    <>
      <button
        aria-label={`${o.building.name}, level ${o.level}${ready ? ", ready to upgrade" : ""}`}
        className="group absolute outline-none"
        style={{ left: at.x - size / 2, top: at.y - size * 0.8, width: size, height: size, zIndex: depth }}
        title={o.building.name}
        type="button"
        onClick={() => onOpen(o.building)}
      >
        {/* The plot: trampled earth under a building, a staked-out patch on an empty one */}
        <span
          className={clsx(
            "absolute left-[6%] right-[6%] bottom-[8%] h-[30%] rounded-[50%]",
            built || o.job
              ? "bg-[radial-gradient(closest-side,rgba(0,0,0,0.5),rgba(0,0,0,0.25)_60%,transparent)]"
              : "bg-[#6B5232]/55 border border-dashed border-goldhi/50",
          )}
        />
        <img
          alt=""
          className={clsx(
            "relative w-full h-full object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] transition-[transform,filter,opacity] duration-200",
            "group-hover:-translate-y-[3%] group-hover:brightness-110 group-active:scale-95 group-focus-visible:brightness-125",
            !built && !o.job && "opacity-45 grayscale-[0.9] brightness-75 group-hover:opacity-75",
          )}
          draggable={false}
          src={buildingImage(o.building)}
        />
      </button>

      {/* Over the roof: ready to upgrade, or the work under way */}
      {(gem || o.job) && (
        <OnScreen x={at.x} y={at.y - size * 0.72} z={20000 + depth}>
          <div className="absolute left-0 bottom-0 -translate-x-1/2 flex flex-col items-center gap-0.5">
            {o.job ? (
              <>
                <span className="px-1.5 rounded bg-[#1A120B]/90 border border-gold/40 text-[10px] leading-[14px] font-bold text-goldtext whitespace-nowrap">
                  {formatDuration(o.job.endsAt - now)}
                </span>
                <span className="w-10 h-1.5 rounded-full bg-[#1A120B]/90 border border-black/40 overflow-hidden">
                  <span className="block h-full bg-gradient-to-r from-gold to-ember" style={{ width: `${progress * 100}%` }} />
                </span>
              </>
            ) : (
              <UpgradeMark className={compact ? "w-[15px] h-[15px]" : "w-[18px] h-[18px]"} />
            )}
          </div>
        </OnScreen>
      )}

      {/* At its foot: the level, and the name when there's room for it (zoomed out, only when named) */}
      {(named || !compact) && (
        <OnScreen x={at.x} y={at.y + 1} z={10000 + depth}>
          <button
            aria-hidden="true"
            className={clsx(
              "absolute left-0 top-0 -translate-x-1/2 pointer-events-auto flex items-center gap-1 py-0.5 rounded-full border whitespace-nowrap",
              compact ? "text-[9.5px]" : "text-[11px]",
              "bg-[#1A120B]/85 shadow-[0_1px_4px_rgba(0,0,0,0.7)] transition-colors hover:border-gold",
              named ? "pl-0.5 pr-2" : "px-0.5",
              ready ? "border-good/80" : o.job ? "border-gold/70" : built ? "border-frame" : "border-line/60 border-dashed",
            )}
            tabIndex={-1}
            type="button"
            onClick={() => onOpen(o.building)}
          >
            <span
              className={clsx(
                "shrink-0 rounded-full border flex items-center justify-center font-display font-black leading-none",
                compact ? "w-[15px] h-[15px] text-[8.5px]" : "w-[18px] h-[18px] text-[10px]",
                built
                  ? "bg-gradient-to-b from-goldhi to-gold text-[#1A120B] border-[#FBE3A6]"
                  : ready
                    ? "bg-good/25 text-good border-good/80"
                    : "bg-panel2 text-muted border-line",
              )}
            >
              {built ? o.level : "+"}
            </span>
            {named && <span className={clsx("font-bold leading-none", built || o.job ? "text-parch" : "text-muted")}>{o.building.name}</span>}
          </button>
        </OnScreen>
      )}
    </>
  );
});

/** Rough size of a name plate on screen (px), for deciding which fit; zoomed out they're smaller. */
export const plateSize = (name: string, named: boolean, compact: boolean) =>
  compact ? { w: named ? 24 + name.length * 5.3 : 18, h: 18 } : { w: named ? 30 + name.length * 6.2 : 22, h: 22 };

// ─── The village ─────────────────────────────────────────────────────────────
