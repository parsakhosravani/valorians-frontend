"use client";

import clsx from "clsx";
import { FunctionComponent } from "react";

import { BuildingDef, buildingImage } from "@/lib/game/config";
import { UpgradeOption, canStart } from "@/lib/game/advice";
import { formatDuration } from "@/lib/format";
import { GameIcon } from "@/components/atoms/GameIcon";

/**
 * Where each building stands. Rows alternate 3 and 2 buildings like a honeycomb,
 * from the far edge (mines and fields) down to the gate and the shore.
 */
const ROWS: string[][] = [
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
];

/** The village is drawn in units where its width is 100. */
const ROW_GAP = 25;
const TOP = 17;
const HEIGHT = TOP + (ROWS.length - 1) * ROW_GAP + 19;

const rowY = (r: number) => TOP + r * ROW_GAP;

const PLOTS: Record<string, { x: number; y: number }> = Object.fromEntries(
  ROWS.flatMap((row, r) => {
    const xs = row.length === 3 ? [18, 50, 82] : [34, 66];

    return row.map((id, i) => [id, { x: xs[i], y: rowY(r) }]);
  }),
);

/** Building width in village units; a few landmarks are bigger. */
const SIZE = 30;
const BIG: Record<string, number> = { "town-hall": 1.25, "city-gate": 1.1 };

const TOWN_HALL_Y = PLOTS["town-hall"].y;

const Ground = () => (
  <svg aria-hidden="true" className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox={`0 0 100 ${HEIGHT}`}>
    <defs>
      <radialGradient cx="50%" cy="50%" id="v-grass" r="70%">
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
    <rect fill="url(#v-grass)" height={HEIGHT} width="100" />
    {/* Dirt roads under each row of buildings, joined by a main road down the middle */}
    <g fill="none" stroke="#7A5C38" strokeLinecap="round" strokeOpacity="0.7">
      {ROWS.map((_, r) => (
        <path key={r} d={`M6 ${rowY(r) + 9} Q50 ${rowY(r) + 11} 94 ${rowY(r) + 9}`} strokeWidth="1.4" />
      ))}
      <path d={`M50 4 L50 ${HEIGHT - 4}`} strokeWidth="3" />
    </g>
    {/* Plaza in front of the Town Hall */}
    <ellipse cx="50" cy={TOWN_HALL_Y + 8} fill="url(#v-plaza)" opacity="0.8" rx="26" ry="9" />
    {/* Shore by the Harbor */}
    <path
      d={`M0 ${HEIGHT - 34} Q14 ${HEIGHT - 30} 20 ${HEIGHT - 18} Q26 ${HEIGHT - 6} 34 ${HEIGHT} L0 ${HEIGHT} Z`}
      fill="url(#v-sea)"
    />
    {/* Palisade around the village */}
    <rect
      fill="none"
      height={HEIGHT - 6}
      rx="6"
      stroke="#5A3E22"
      strokeDasharray="1.2 0.8"
      strokeWidth="1.4"
      width="94"
      x="3"
      y="3"
    />
    <rect filter="url(#v-noise)" height={HEIGHT} width="100" />
  </svg>
);

/** Position of a plot as CSS percentages of the village box. */
const at = (x: number, y: number) => ({ left: `${x}%`, top: `${(y / HEIGHT) * 100}%` });

type PlotProps = { o: UpgradeOption; freeBuilder: boolean; now: number; onOpen: (b: BuildingDef) => void };

/** The building art itself, layered so nearer rows overlap farther ones. */
const Art = ({ o, now, onOpen }: PlotProps) => {
  const { x, y } = PLOTS[o.building.id];
  const size = SIZE * (BIG[o.building.id] ?? 1);
  const built = o.level > 0;
  const progress = o.job ? Math.min(1, (now - o.job.startedAt) / (o.job.endsAt - o.job.startedAt)) : 0;

  return (
    <button
      aria-label={`${o.building.name}, level ${o.level}`}
      className="absolute -translate-x-1/2 -translate-y-[62%] aspect-square active:scale-95 transition-transform"
      style={{ ...at(x, y), width: `${size}%`, zIndex: Math.round(y) }}
      onClick={() => onOpen(o.building)}
    >
      {/* Shadow on the ground */}
      <span className="absolute left-[12%] right-[12%] bottom-[4%] h-[14%] rounded-[50%] bg-black/35 blur-[3px]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        className={clsx(
          "relative w-full h-full object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]",
          !built && !o.job && "opacity-45 grayscale",
        )}
        draggable={false}
        src={buildingImage(o.building)}
      />
      {/* Under construction: time left and progress, over the roof */}
      {o.job && (
        <span className="absolute left-[10%] right-[10%] top-0 flex flex-col items-center gap-0.5">
          <span className="px-1.5 rounded-md bg-[#1A120B]/85 border border-gold/70 text-[10px] font-bold text-goldtext whitespace-nowrap">
            <GameIcon e="🔨" /> {formatDuration(o.job.endsAt - now)}
          </span>
          <span className="w-full h-1.5 rounded-full bg-[#1A120B]/85 overflow-hidden border border-line/60">
            <span className="block h-full bg-gradient-to-r from-gold to-ember" style={{ width: `${progress * 100}%` }} />
          </span>
        </span>
      )}
    </button>
  );
};

/** Name tag with the level, drawn above every building so none get covered. */
const Tag = ({ o, freeBuilder, onOpen }: PlotProps) => {
  const { x, y } = PLOTS[o.building.id];
  const built = o.level > 0;
  const ready = !o.job && freeBuilder && canStart(o);

  return (
    <button
      aria-hidden="true"
      className={clsx(
        "absolute -translate-x-1/2 translate-y-[55%] z-[1000] flex items-center gap-1 max-w-[31%] pl-0.5 pr-1.5 py-px rounded-full border text-[10px] leading-tight font-bold whitespace-nowrap",
        ready ? "bg-[#1E2A14]/90 border-good text-parch" : "bg-[#1A120B]/85 border-line text-parch",
      )}
      style={at(x, y)}
      tabIndex={-1}
      onClick={() => onOpen(o.building)}
    >
      <span
        className={clsx(
          "shrink-0 min-w-[16px] h-[16px] px-0.5 rounded-full flex items-center justify-center font-display font-black text-[9px]",
          ready ? "bg-good text-[#14210E]" : built ? "bg-gold text-[#1A120B]" : "bg-panel2 text-muted",
        )}
      >
        {ready ? "↑" : o.maxed ? "★" : o.level}
      </span>
      <span className="truncate">{built || o.job ? o.building.name : `Build ${o.building.name}`}</span>
    </button>
  );
};

/** The tribe as a village: every building on its own plot. Tap one to open it. */
export const Village: FunctionComponent<{
  options: UpgradeOption[];
  freeBuilder: boolean;
  now: number;
  onOpen: (b: BuildingDef) => void;
}> = ({ options, freeBuilder, now, onOpen }) => {
  const placed = options.filter((o) => PLOTS[o.building.id]);

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden border border-line shadow-[inset_0_0_40px_rgba(0,0,0,0.6)]"
      style={{ aspectRatio: `100 / ${HEIGHT}` }}
    >
      <Ground />
      {placed.map((o) => (
        <Art key={o.building.id} freeBuilder={freeBuilder} now={now} o={o} onOpen={onOpen} />
      ))}
      {placed.map((o) => (
        <Tag key={o.building.id} freeBuilder={freeBuilder} now={now} o={o} onOpen={onOpen} />
      ))}
    </div>
  );
};
