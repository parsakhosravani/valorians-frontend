"use client";

import clsx from "clsx";
import { FunctionComponent, useEffect, useRef, useState } from "react";

import { BuildingDef, buildingImage } from "@/lib/game/config";
import { UpgradeOption, canStart } from "@/lib/game/advice";
import { formatDuration } from "@/lib/format";

/**
 * A village layout. Rows go from the far edge (mines and fields) down to the
 * gate and the shore; each row's buildings are spread evenly across it.
 * Everything is in village units, where the village is 100 units wide.
 */
type Layout = {
  rows: string[][];
  /** Building width. */
  size: number;
  rowGap: number;
  top: number;
  bottom: number;
  /** Text size of the name plates, in px. */
  label: number;
};

/** Phone: a tall honeycomb, 3 and 2 buildings per row. */
const NARROW: Layout = {
  rows: [
    ["iron-mine", "sawmill", "brickyard"],
    ["windmill", "fertilizer-workshop"],
    ["hideout", "resource-warehouse", "treasury"],
    ["academy", "trading-post"],
    ["exploration-center", "town-hall", "embassy"],
    ["hospital", "war-hall"],
    ["barracks", "military-command", "stable"],
    ["arsenal", "armory"],
    ["siege-workshop", "watchtower", "trapmaker"],
    ["harbor", "city-gate"],
  ],
  size: 22,
  rowGap: 21,
  top: 15,
  bottom: 17,
  label: 10,
};

/**
 * Desktop: a wide village. Fields along the top, the Town Hall square, then
 * the military quarter, with the gate, watchtower and harbor by the shore.
 */
const WIDE: Layout = {
  rows: [
    ["iron-mine", "sawmill", "windmill", "fertilizer-workshop", "brickyard", "resource-warehouse"],
    ["hideout", "academy", "town-hall", "trading-post", "treasury"],
    ["exploration-center", "embassy", "hospital", "war-hall", "military-command", "barracks"],
    ["stable", "arsenal", "armory", "siege-workshop", "trapmaker"],
    ["harbor", "city-gate", "watchtower"],
  ],
  size: 14.5,
  rowGap: 15,
  top: 13,
  bottom: 10,
  label: 12,
};

/** Wider than this (in px), the village switches to the wide layout. */
const WIDE_FROM = 600;

/** A few landmarks are drawn bigger. */
const BIG: Record<string, number> = { "town-hall": 1.2 };

const build = (layout: Layout) => {
  const height = layout.top + (layout.rows.length - 1) * layout.rowGap + layout.bottom;
  const widest = Math.max(...layout.rows.map((r) => r.length));
  // Rows are centred and share one spacing, so a short row sits in the gaps of a long one
  // like a honeycomb. Phone rows keep their 20 / 50 / 80 spots.
  const step = widest <= 3 ? 30 : 80 / (widest - 1);
  const plots: Record<string, { x: number; y: number }> = Object.fromEntries(
    layout.rows.flatMap((row, r) => row.map((id, i) => [id, { x: 50 + (i - (row.length - 1) / 2) * step, y: layout.top + r * layout.rowGap }])),
  );

  return { ...layout, height, plots, step };
};

type Built = ReturnType<typeof build>;

const LAYOUTS = { narrow: build(NARROW), wide: build(WIDE) };

const Ground = ({ v }: { v: Built }) => {
  const H = v.height;
  const hall = v.plots["town-hall"];
  const harbor = v.plots["harbor"];
  const gate = v.plots["city-gate"];

  return (
    <svg aria-hidden="true" className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox={`0 0 100 ${H}`}>
      <defs>
        <radialGradient cx="50%" cy="45%" id="v-grass" r="70%">
          <stop offset="0" stopColor="#5E6B33" />
          <stop offset="0.65" stopColor="#46512A" />
          <stop offset="1" stopColor="#2A2F1C" />
        </radialGradient>
        <radialGradient cx="50%" cy="50%" id="v-plaza" r="50%">
          <stop offset="0" stopColor="#8A6A43" />
          <stop offset="1" stopColor="#8A6A43" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="v-sea" x1="0" x2="1" y1="1" y2="0">
          <stop offset="0" stopColor="#1C3F54" />
          <stop offset="1" stopColor="#2F5664" />
        </linearGradient>
        <filter height="100%" id="v-noise" width="100%" x="0" y="0">
          <feTurbulence baseFrequency="0.9" numOctaves="2" seed="4" type="fractalNoise" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0" />
        </filter>
      </defs>
      <rect fill="url(#v-grass)" height={H} width="100" />
      {/* Dirt road from the Town Hall down to the gate */}
      <path
        d={`M${hall.x} ${hall.y} C${hall.x} ${(hall.y + gate.y) / 2} ${gate.x} ${(hall.y + gate.y) / 2} ${gate.x} ${H - 2}`}
        fill="none"
        stroke="#7A5C38"
        strokeLinecap="round"
        strokeOpacity="0.45"
        strokeWidth="2.4"
      />
      {/* Plaza in front of the Town Hall */}
      <ellipse cx={hall.x} cy={hall.y + 4} fill="url(#v-plaza)" opacity="0.6" rx="20" ry="7" />
      {/* Shore by the Harbor */}
      <path
        d={`M0 ${harbor.y - 11} Q${harbor.x - 6} ${harbor.y - 7} ${harbor.x - 1} ${harbor.y + 2} Q${harbor.x + 4} ${H - 4} ${harbor.x + 11} ${H} L0 ${H} Z`}
        fill="url(#v-sea)"
      />
      {/* Palisade around the village */}
      <rect
        fill="none"
        height={H - 6}
        rx="6"
        stroke="#5A3E22"
        strokeDasharray="1.2 0.8"
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
        width="94"
        x="3"
        y="3"
      />
      <rect filter="url(#v-noise)" height={H} width="100" />
    </svg>
  );
};

type PlotProps = { v: Built; o: UpgradeOption; freeBuilder: boolean; now: number; onOpen: (b: BuildingDef) => void };

/** Position of a plot as CSS percentages of the village box. */
const at = (v: Built, x: number, y: number) => ({ left: `${x}%`, top: `${(y / v.height) * 100}%` });

/** The building art itself, layered so nearer rows overlap farther ones. */
const Art = ({ v, o, now, onOpen }: PlotProps) => {
  const { x, y } = v.plots[o.building.id];
  const size = v.size * (BIG[o.building.id] ?? 1);
  const built = o.level > 0;
  const progress = o.job ? Math.min(1, (now - o.job.startedAt) / (o.job.endsAt - o.job.startedAt)) : 0;

  return (
    <button
      aria-label={`${o.building.name}, level ${o.level}`}
      className="group absolute -translate-x-1/2 -translate-y-[64%] aspect-square active:scale-95 transition-transform"
      style={{ ...at(v, x, y), width: `${size}%`, zIndex: Math.round(y) }}
      title={o.building.name}
      onClick={() => onOpen(o.building)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        className={clsx(
          "relative w-full h-full object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] transition-[transform,filter] duration-200",
          "group-hover:-translate-y-[3%] group-hover:drop-shadow-[0_6px_8px_rgba(0,0,0,0.55)] group-hover:brightness-110",
          !built && !o.job && "opacity-45 grayscale",
        )}
        draggable={false}
        src={buildingImage(o.building)}
      />
      {/* Under construction: time left and progress, over the roof */}
      {o.job && (
        <span className="absolute left-[14%] right-[14%] top-[2%] flex flex-col items-center gap-0.5">
          <span className="px-1 rounded bg-[#1A120B]/85 text-[9px] font-bold text-goldtext whitespace-nowrap">
            {formatDuration(o.job.endsAt - now)}
          </span>
          <span className="w-full h-1 rounded-full bg-[#1A120B]/85 overflow-hidden">
            <span className="block h-full bg-gradient-to-r from-gold to-ember" style={{ width: `${progress * 100}%` }} />
          </span>
        </span>
      )}
    </button>
  );
};

/**
 * A name plate at each building's foot: the level (green ↑ when it can be
 * upgraded now) and the building's name, so every plot can be told apart.
 */
const Plate = ({ v, o, freeBuilder, onOpen }: PlotProps) => {
  const { x, y } = v.plots[o.building.id];
  const size = v.size * (BIG[o.building.id] ?? 1);
  const built = o.level > 0;
  const ready = !o.job && freeBuilder && canStart(o);

  return (
    <button
      aria-hidden="true"
      className={clsx(
        "absolute -translate-x-1/2 z-[1000] flex items-center gap-1 py-[2px] pl-[2px] pr-1.5 rounded-[10px] border",
        "bg-[#1A120B]/85 backdrop-blur-[2px] shadow-[0_1px_4px_rgba(0,0,0,0.7)] transition-colors hover:border-gold",
        ready ? "border-good/70" : built ? "border-frame" : "border-line/60",
      )}
      style={{ ...at(v, x, y + size * 0.26), maxWidth: `${v.step - 1.5}%` }}
      tabIndex={-1}
      onClick={() => onOpen(o.building)}
    >
      <span
        className={clsx(
          "shrink-0 rounded-full border flex items-center justify-center font-display font-black leading-none",
          ready ? "bg-good text-[#14210E] border-[#E6F5D9]" : built ? "bg-gold text-[#1A120B] border-[#FBE3A6]" : "bg-panel2 text-muted border-line",
        )}
        style={{ minWidth: v.label + 6, height: v.label + 6, fontSize: v.label - 1 }}
      >
        {ready ? (built ? "↑" : "+") : o.maxed ? "★" : built ? o.level : "+"}
      </span>
      <span className={clsx("font-bold leading-[1.1] text-left", built || o.job ? "text-parch" : "text-muted")} style={{ fontSize: v.label }}>
        {o.building.name}
      </span>
    </button>
  );
};

/** Tracks an element's width so the village can pick its layout. */
const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;

    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));

    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
};

/** The tribe as a village: every building on its own named plot. Tap one to open it. */
export const Village: FunctionComponent<{
  options: UpgradeOption[];
  freeBuilder: boolean;
  now: number;
  onOpen: (b: BuildingDef) => void;
}> = ({ options, freeBuilder, now, onOpen }) => {
  const [ref, width] = useWidth();
  const v = width >= WIDE_FROM ? LAYOUTS.wide : LAYOUTS.narrow;
  const placed = options.filter((o) => v.plots[o.building.id]);

  return (
    <div
      ref={ref}
      className="relative isolate w-full rounded-2xl overflow-hidden border border-frame/60 shadow-card"
      style={{ aspectRatio: `100 / ${v.height}` }}
    >
      <Ground v={v} />
      {placed.map((o) => (
        <Art key={o.building.id} freeBuilder={freeBuilder} now={now} o={o} v={v} onOpen={onOpen} />
      ))}
      {placed.map((o) => (
        <Plate key={o.building.id} freeBuilder={freeBuilder} now={now} o={o} v={v} onOpen={onOpen} />
      ))}
    </div>
  );
};
