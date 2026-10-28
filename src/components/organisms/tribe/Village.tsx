"use client";

import clsx from "clsx";
import { CSSProperties, FunctionComponent, useEffect, useId, useRef, useState } from "react";

import { BuildingDef, buildingImage } from "@/lib/game/config";
import { UpgradeOption, canStart } from "@/lib/game/advice";
import { formatDuration } from "@/lib/format";

/**
 * A walled village in the Travian manner: the Town Hall on its square in the
 * middle, the village's buildings in streets around it, a palisade with the
 * City Gate and Watchtower set into it, and the mines, fields and harbor
 * outside.
 *
 * Plots sit on a street grid, so a building and its name plate never cover a
 * neighbour at any width. Everything is in village units: the village is 100
 * units wide and `height` tall. A plot's point is the foot of its building.
 */
type Pt = { x: number; y: number };

type Layout = {
  height: number;
  /** Building width. */
  size: number;
  /** Name plate text size, as a share of the village's width (cqw), before clamping. */
  label: number;
  /** Widest a name plate may get, in village units. */
  plate: number;
  /** The palisade, a rounded rectangle. */
  wall: { x: number; y: number; w: number; h: number; r: number };
  plots: Record<string, Pt>;
  /** Streets inside the wall, as polylines. */
  streets: Pt[][];
  /** Clumps of trees outside the wall: x, y, radius. */
  woods: [number, number, number][];
  /** Tilled fields outside the wall: x, y, width, height, angle. */
  fields: [number, number, number, number, number][];
};

const row = (y: number, spots: [string, number][]) => Object.fromEntries(spots.map(([id, x]) => [id, { x, y }]));
const line = (...pts: [number, number][]) => pts.map(([x, y]) => ({ x, y }));

/** Wide windows (Telegram Desktop, tablets on their side): three streets across. */
const WIDE: Layout = (() => {
  const wall = { x: 13, y: 13, w: 74, h: 51, r: 6 };

  return {
    height: 74,
    size: 9,
    label: 1.1,
    plate: 11,
    wall,
    plots: {
      ...row(27, [
        ["hideout", 20],
        ["treasury", 32],
        ["academy", 44],
        ["embassy", 56],
        ["trading-post", 68],
        ["resource-warehouse", 80],
      ]),
      ...row(41.5, [
        ["exploration-center", 20],
        ["war-hall", 32],
        ["town-hall", 50],
        ["hospital", 68],
        ["military-command", 80],
      ]),
      // The front street leaves room for the gate in the middle.
      ...row(55.5, [
        ["barracks", 19],
        ["stable", 29],
        ["siege-workshop", 39],
        ["arsenal", 61],
        ["armory", 71],
        ["trapmaker", 81],
      ]),
      // On the wall.
      "city-gate": { x: 50, y: wall.y + wall.h + 0.5 },
      watchtower: { x: wall.x + wall.w, y: wall.y + 1 },
      // Outside: mines and the sawmill to the west, fields and the windmill to the east, the harbor on the shore.
      "iron-mine": { x: 6.5, y: 27 },
      sawmill: { x: 6.5, y: 45 },
      windmill: { x: 93.5, y: 27 },
      brickyard: { x: 93.5, y: 45 },
      "fertilizer-workshop": { x: 93.5, y: 63 },
      harbor: { x: 7, y: 68 },
    },
    streets: [
      line([wall.x + 2, 33.5], [wall.x + wall.w - 2, 33.5]),
      line([wall.x + 2, 48], [wall.x + wall.w - 2, 48]),
      line([50, 20], [50, wall.y + wall.h + 1]),
      line([50, wall.y + wall.h], [50, 70], [57, 75]),
    ],
    woods: [
      [27, 5, 3.6],
      [63, 4.5, 3.2],
      [3, 5, 3.4],
      [97, 6, 3.4],
      [45, 70, 2.6],
      [76, 70, 3],
    ],
    fields: [
      [44, 5.5, 10, 4.5, -3],
      [81, 5, 8, 4, 4],
      [28, 70, 9, 4, 3],
      [93.5, 9, 6, 6, 0],
    ],
  };
})();

/** Phones: the same village stood upright, three plots to a street. */
const NARROW: Layout = (() => {
  const wall = { x: 4, y: 53, w: 92, h: 185, r: 10 };
  const cols = { l: 19, m: 50, r: 81 };

  return {
    height: 274,
    size: 18,
    label: 3,
    plate: 30,
    wall,
    plots: {
      // Outside the wall, at the back: mines and fields.
      "iron-mine": { x: 17, y: 20 },
      sawmill: { x: 50, y: 17 },
      brickyard: { x: 83, y: 20 },
      windmill: { x: 31, y: 43 },
      "fertilizer-workshop": { x: 69, y: 43 },
      // Inside, street by street from the back to the gate.
      ...row(76, [
        ["hideout", cols.l],
        ["treasury", cols.m],
        ["resource-warehouse", cols.r],
      ]),
      ...row(102, [
        ["academy", cols.l],
        ["embassy", cols.m],
        ["trading-post", cols.r],
      ]),
      ...row(133, [
        ["exploration-center", cols.l],
        ["town-hall", cols.m],
        ["war-hall", cols.r],
      ]),
      ...row(163, [
        ["hospital", cols.l],
        ["military-command", cols.m],
        ["armory", cols.r],
      ]),
      ...row(189, [
        ["barracks", cols.l],
        ["arsenal", cols.m],
        ["stable", cols.r],
      ]),
      ...row(213, [
        ["siege-workshop", cols.l],
        ["trapmaker", cols.r],
      ]),
      // On the wall.
      "city-gate": { x: 50, y: wall.y + wall.h + 1 },
      // Beside the gate, at the wall's corner.
      watchtower: { x: wall.x + 8, y: wall.y + wall.h + 1 },
      // On the shore.
      harbor: { x: 17, y: 261 },
    },
    streets: [
      ...[88, 117, 147, 175, 201, 225].map((y) => line([wall.x + 3, y], [wall.x + wall.w - 3, y])),
      line([34.5, 62], [34.5, 225]),
      line([65.5, 62], [65.5, 225]),
      line([50, 225], [50, 248], [58, 274]),
    ],
    woods: [
      [5, 6, 6],
      [95, 5, 5.5],
      [5, 44, 4.5],
      [95, 45, 4.5],
      [93, 262, 6],
      [70, 268, 4.5],
    ],
    fields: [
      [33, 6, 12, 5.5, -5],
      [67, 6, 12, 5.5, 5],
      [50, 41, 9, 7, 0],
      [83, 252, 10, 5, 4],
    ],
  };
})();

/** Wider than this (in px), the village switches to the wide layout. */
const WIDE_FROM = 600;

/** A few landmarks are drawn bigger. */
const BIG: Record<string, number> = { "town-hall": 1.4, "city-gate": 1.15, watchtower: 1.05 };

const sizeOf = (v: Layout, id: string) => v.size * (BIG[id] ?? 1);

const pathOf = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");

/** The ground: grass, the palisade, streets, the square, woods, fields and the shore. */
const Ground = ({ v }: { v: Layout }) => {
  const id = useId().replace(/:/g, "");
  const u = (name: string) => `url(#${id}-${name})`;
  const H = v.height;
  const { x: wx, y: wy, w: ww, h: wh, r } = v.wall;
  const hall = v.plots["town-hall"];
  const gate = v.plots["city-gate"];
  const harbor = v.plots["harbor"];
  const hallSize = sizeOf(v, "town-hall");
  const gateGap = sizeOf(v, "city-gate") * 0.42;
  const bottom = wy + wh;

  // The palisade runs from the right of the gate, all the way round, to the left of the gate.
  const palisade = [
    `M${gate.x + gateGap} ${bottom}`,
    `L${wx + ww - r} ${bottom}`,
    `Q${wx + ww} ${bottom} ${wx + ww} ${bottom - r}`,
    `L${wx + ww} ${wy + r}`,
    `Q${wx + ww} ${wy} ${wx + ww - r} ${wy}`,
    `L${wx + r} ${wy}`,
    `Q${wx} ${wy} ${wx} ${wy + r}`,
    `L${wx} ${bottom - r}`,
    `Q${wx} ${bottom} ${wx + r} ${bottom}`,
    `L${gate.x - gateGap} ${bottom}`,
  ].join(" ");
  const corners: Pt[] = [
    { x: wx + 1.2, y: wy + 1.2 },
    { x: wx + ww - 1.2, y: wy + 1.2 },
    { x: wx + 1.2, y: bottom - 1.2 },
    { x: wx + ww - 1.2, y: bottom - 1.2 },
  ];
  const post = v.size * 0.09;

  return (
    <svg aria-hidden="true" className="absolute inset-0 w-full h-full" viewBox={`0 0 100 ${H}`}>
      <defs>
        <radialGradient cx="50%" cy="48%" id={`${id}-grass`} r="70%">
          <stop offset="0" stopColor="#66752F" />
          <stop offset="0.6" stopColor="#4B5926" />
          <stop offset="1" stopColor="#283016" />
        </radialGradient>
        <radialGradient cx="50%" cy="50%" id={`${id}-inside`} r="65%">
          <stop offset="0" stopColor="#8E7447" stopOpacity="0.5" />
          <stop offset="0.7" stopColor="#7C6A3D" stopOpacity="0.28" />
          <stop offset="1" stopColor="#6A6A33" stopOpacity="0.12" />
        </radialGradient>
        <radialGradient id={`${id}-plaza`}>
          <stop offset="0" stopColor="#B49668" />
          <stop offset="0.75" stopColor="#957650" />
          <stop offset="1" stopColor="#6E5534" />
        </radialGradient>
        <radialGradient cx="40%" cy="35%" id={`${id}-tree`}>
          <stop offset="0" stopColor="#56722F" />
          <stop offset="0.6" stopColor="#30461A" />
          <stop offset="1" stopColor="#1A2610" />
        </radialGradient>
        <linearGradient id={`${id}-sea`} x1="0" x2="1" y1="1" y2="0">
          <stop offset="0" stopColor="#163343" />
          <stop offset="1" stopColor="#2F5866" />
        </linearGradient>
        <pattern height="1.4" id={`${id}-rows`} patternTransform="rotate(90)" patternUnits="userSpaceOnUse" width="1.4">
          <rect fill="#A08D40" height="1.4" width="1.4" />
          <rect fill="#7C6E2E" height="1.4" width="0.55" />
        </pattern>
        <pattern height="2.2" id={`${id}-cobble`} patternUnits="userSpaceOnUse" width="2.2">
          <rect fill="#9A7C52" height="2.2" width="2.2" />
          <circle cx="0.55" cy="0.55" fill="#B39466" r="0.42" />
          <circle cx="1.65" cy="1.65" fill="#B39466" r="0.42" />
          <circle cx="1.65" cy="0.55" fill="#87693F" r="0.36" />
          <circle cx="0.55" cy="1.65" fill="#87693F" r="0.36" />
        </pattern>
        {/* Rough, painterly edges for streets, fields and the shore */}
        <filter id={`${id}-rough`}>
          <feTurbulence baseFrequency="0.35" numOctaves="2" seed="7" type="fractalNoise" />
          <feDisplacementMap in="SourceGraphic" scale="1.1" />
        </filter>
        {/* Patchy grass */}
        <filter height="100%" id={`${id}-patches`} width="100%" x="0" y="0">
          <feTurbulence baseFrequency="0.06" numOctaves="3" seed="11" type="fractalNoise" />
          <feColorMatrix values="0 0 0 0 0.12  0 0 0 0 0.16  0 0 0 0 0.05  0 0 0 1.4 -0.55" />
        </filter>
        <filter height="100%" id={`${id}-grain`} width="100%" x="0" y="0">
          <feTurbulence baseFrequency="0.9" numOctaves="2" seed="4" type="fractalNoise" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.28 0" />
        </filter>
        <filter id={`${id}-shadow`}>
          <feGaussianBlur stdDeviation="0.5" />
        </filter>
      </defs>

      {/* Grass, darker toward the edges, in patches */}
      <rect fill={u("grass")} height={H} width="100" />
      <rect filter={u("patches")} height={H} width="100" />

      {/* Sea in the corner by the Harbor, with a sandy shore */}
      <path
        d={`M0 ${harbor.y - 13} Q${harbor.x + 3} ${harbor.y - 9} ${harbor.x + 5} ${harbor.y - 1} Q${harbor.x + 9} ${H - 3} ${harbor.x + 17} ${H} L0 ${H} Z`}
        fill="#8E7B52"
        filter={u("rough")}
      />
      <path
        d={`M0 ${harbor.y - 11} Q${harbor.x + 1} ${harbor.y - 7.5} ${harbor.x + 3.5} ${harbor.y} Q${harbor.x + 7} ${H - 2.5} ${harbor.x + 15} ${H} L0 ${H} Z`}
        fill={u("sea")}
        filter={u("rough")}
      />
      <g fill="none" stroke="#9CC4D6" strokeLinecap="round" strokeOpacity="0.35" strokeWidth="0.3">
        <path d={`M${harbor.x - 12} ${H - 4} q1.5 -0.8 3 0 t3 0`} />
        <path d={`M${harbor.x - 6} ${H - 1.5} q1.5 -0.8 3 0 t3 0`} />
      </g>

      {/* Tilled fields */}
      {v.fields.map(([x, y, w, h, a], i) => (
        <g key={i} filter={u("rough")} transform={`rotate(${a} ${x} ${y})`}>
          <rect fill={u("rows")} height={h} opacity="0.8" rx="0.8" width={w} x={x - w / 2} y={y - h / 2} />
        </g>
      ))}

      {/* Worn ground inside the wall */}
      <rect fill={u("inside")} height={wh} rx={r} width={ww} x={wx} y={wy} />

      {/* Streets: a dark bed, then the packed-earth top */}
      <g fill="none" filter={u("rough")} strokeLinecap="round" strokeLinejoin="round">
        {v.streets.map((s, i) => (
          <path key={`b${i}`} d={pathOf(s)} stroke="#5E4529" strokeOpacity="0.55" strokeWidth={v.size * 0.24} />
        ))}
        {v.streets.map((s, i) => (
          <path key={`t${i}`} d={pathOf(s)} stroke="#9A7A4C" strokeOpacity="0.85" strokeWidth={v.size * 0.16} />
        ))}
      </g>

      {/* The Town Hall square, cobbled */}
      <ellipse cx={hall.x} cy={hall.y - hallSize * 0.12} fill="#000" filter={u("shadow")} opacity="0.35" rx={hallSize * 0.72} ry={hallSize * 0.4} />
      <ellipse cx={hall.x} cy={hall.y - hallSize * 0.16} fill={u("cobble")} filter={u("rough")} rx={hallSize * 0.7} ry={hallSize * 0.38} />
      <ellipse cx={hall.x} cy={hall.y - hallSize * 0.16} fill={u("plaza")} opacity="0.55" rx={hallSize * 0.7} ry={hallSize * 0.38} />

      {/* Palisade: shadow, dark logs, light log tops */}
      <path d={palisade} fill="none" filter={u("shadow")} stroke="#000" strokeOpacity="0.45" strokeWidth={post * 3.4} transform="translate(0.4 0.7)" />
      <path d={palisade} fill="none" stroke="#3A2614" strokeLinecap="round" strokeLinejoin="round" strokeWidth={post * 2.8} />
      <path d={palisade} fill="none" stroke="#8A6236" strokeDasharray={`${post * 0.9} ${post * 0.55}`} strokeWidth={post * 1.7} />
      <path
        d={palisade}
        fill="none"
        stroke="#D3A869"
        strokeDasharray={`${post * 0.9} ${post * 0.55}`}
        strokeOpacity="0.5"
        strokeWidth={post * 0.45}
        transform={`translate(0 ${-post * 0.6})`}
      />

      {/* Corner posts */}
      {corners.map((c, i) => (
        <g key={i}>
          <circle cx={c.x + 0.3} cy={c.y + 0.5} fill="#000" filter={u("shadow")} opacity="0.5" r={post * 2.6} />
          <circle cx={c.x} cy={c.y} fill="#3A2614" r={post * 2.4} />
          <circle cx={c.x} cy={c.y} fill="#7E5730" r={post * 1.8} />
          <circle cx={c.x - post * 0.4} cy={c.y - post * 0.4} fill="#C49A5E" opacity="0.55" r={post * 0.8} />
        </g>
      ))}

      {/* Woods */}
      {v.woods.map(([x, y, rad], i) => (
        <g key={i}>
          {[
            [-0.45, 0.1, 0.62],
            [0.42, 0.18, 0.58],
            [0, -0.25, 0.66],
            [-0.15, 0.5, 0.5],
            [0.25, 0.55, 0.45],
          ].map(([dx, dy, s], j) => (
            <g key={j}>
              <ellipse cx={x + dx * rad + 0.4} cy={y + dy * rad + 0.6} fill="#000" filter={u("shadow")} opacity="0.4" rx={rad * s} ry={rad * s * 0.8} />
              <circle cx={x + dx * rad} cy={y + dy * rad} fill={u("tree")} filter={u("rough")} r={rad * s} />
            </g>
          ))}
        </g>
      ))}

      <rect filter={u("grain")} height={H} width="100" />
    </svg>
  );
};

type PlotProps = { v: Layout; o: UpgradeOption; freeBuilder: boolean; now: number; onOpen: (b: BuildingDef) => void };

/** Position of a plot as CSS percentages of the village box. */
const at = (v: Layout, x: number, y: number) => ({ left: `${x}%`, top: `${(y / v.height) * 100}%` });

/**
 * The "upgrade now" mark: a green gem with a gold rim and a raised double
 * chevron, gently bobbing so ready buildings catch the eye.
 */
const UpgradeMark = ({ className, style }: { className?: string; style?: CSSProperties }) => {
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

/** The building art on its plot, layered so nearer buildings overlap farther ones. */
const Art = ({ v, o, freeBuilder, now, onOpen }: PlotProps) => {
  const { x, y } = v.plots[o.building.id];
  const size = sizeOf(v, o.building.id);
  const built = o.level > 0;
  const ready = !o.job && freeBuilder && canStart(o);
  const progress = o.job ? Math.min(1, (now - o.job.startedAt) / (o.job.endsAt - o.job.startedAt)) : 0;

  return (
    <button
      aria-label={`${o.building.name}, level ${o.level}${ready ? ", ready to upgrade" : ""}`}
      className="group absolute -translate-x-1/2 -translate-y-[74%] aspect-square outline-none"
      style={{ ...at(v, x, y), width: `${size}%`, zIndex: Math.round(y * 10) }}
      title={o.building.name}
      onClick={() => onOpen(o.building)}
    >
      {/* The plot: trampled earth under a building, a staked-out patch on an empty one */}
      <span
        className={clsx(
          "absolute left-[8%] right-[8%] bottom-[6%] h-[28%] rounded-[50%]",
          built || o.job
            ? "bg-[radial-gradient(closest-side,rgba(0,0,0,0.5),rgba(0,0,0,0.25)_60%,transparent)]"
            : "bg-[#6B5232]/50 border border-dashed border-goldhi/45",
        )}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        className={clsx(
          "relative w-full h-full object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] transition-[transform,filter,opacity] duration-200",
          "group-hover:-translate-y-[3%] group-hover:brightness-110 group-active:scale-95 group-focus-visible:brightness-125",
          !built && !o.job && "opacity-40 grayscale-[0.9] brightness-75 group-hover:opacity-70",
        )}
        draggable={false}
        src={buildingImage(o.building)}
      />
      {/* Ready to upgrade: a bobbing gem over the roof */}
      {ready && <UpgradeMark className="absolute right-[6%] top-[4%] w-[26%] h-[26%] min-w-[18px] min-h-[18px] max-w-[30px] max-h-[30px]" />}
      {/* Under construction: time left and progress, over the roof */}
      {o.job && (
        <span className="absolute left-[10%] right-[10%] top-[2%] flex flex-col items-center gap-0.5">
          <span className="px-1.5 rounded bg-[#1A120B]/90 border border-gold/40 text-[10px] leading-[14px] font-bold text-goldtext whitespace-nowrap">
            {formatDuration(o.job.endsAt - now)}
          </span>
          <span className="w-full h-1.5 rounded-full bg-[#1A120B]/90 border border-black/40 overflow-hidden">
            <span className="block h-full bg-gradient-to-r from-gold to-ember" style={{ width: `${progress * 100}%` }} />
          </span>
        </span>
      )}
    </button>
  );
};

/**
 * A name plate at each building's foot: a level medallion and the name. The
 * plate is kept inside the village box, and its text scales with the village.
 */
const Plate = ({ v, o, freeBuilder, onOpen }: PlotProps) => {
  const { x, y } = v.plots[o.building.id];
  const size = sizeOf(v, o.building.id);
  const built = o.level > 0;
  const ready = !o.job && freeBuilder && canStart(o);
  const half = v.plate / 2;
  const cx = Math.min(Math.max(x, half + 0.5), 100 - half - 0.5);

  return (
    <button
      aria-hidden="true"
      className={clsx(
        "absolute -translate-x-1/2 z-[10000] flex items-center gap-[0.3em] py-[0.15em] pl-[0.15em] pr-[0.55em] rounded-full border",
        "bg-[#1A120B]/85 backdrop-blur-[2px] shadow-[0_1px_4px_rgba(0,0,0,0.7)] transition-colors hover:border-gold",
        ready ? "border-good/80" : o.job ? "border-gold/70" : built ? "border-frame" : "border-line/60 border-dashed",
      )}
      style={{
        ...at(v, cx, y + size * 0.2),
        maxWidth: `${v.plate}%`,
        fontSize: `clamp(9px, ${v.label}cqw, 13px)`,
      }}
      tabIndex={-1}
      onClick={() => onOpen(o.building)}
    >
      <span
        className={clsx(
          "shrink-0 w-[1.6em] h-[1.6em] rounded-full border flex items-center justify-center font-display font-black leading-none text-[0.9em]",
          built ? "bg-gradient-to-b from-goldhi to-gold text-[#1A120B] border-[#FBE3A6]" : "bg-panel2 text-muted border-line",
        )}
      >
        {o.maxed ? "★" : built ? o.level : "+"}
      </span>
      <span className={clsx("font-bold leading-[1.1] text-left", built || o.job ? "text-parch" : "text-muted")}>{o.building.name}</span>
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

/** The tribe as a walled village: every building on its own named plot. Tap one to open it. */
export const Village: FunctionComponent<{
  options: UpgradeOption[];
  freeBuilder: boolean;
  now: number;
  onOpen: (b: BuildingDef) => void;
}> = ({ options, freeBuilder, now, onOpen }) => {
  // Measure the room the village has, not the village itself, so switching layouts can't loop.
  const [ref, width] = useWidth();
  const v = width >= WIDE_FROM ? WIDE : NARROW;
  const placed = options.filter((o) => v.plots[o.building.id]);

  return (
    <div ref={ref} className="w-full">
      <div
        className={clsx(
          "relative isolate mx-auto rounded-2xl overflow-hidden border border-frame/60 shadow-card bg-[#283016] [container-type:inline-size]",
          // A tall village on a phone is fine to scroll; a wide one should fit the window.
          v === WIDE ? "w-full max-w-[var(--village-w)]" : "max-w-[480px]",
          !width && "invisible",
        )}
        style={{ aspectRatio: `100 / ${v.height}` }}
      >
        <Ground v={v} />
        {placed.map((o) => (
          <Art key={o.building.id} freeBuilder={freeBuilder} now={now} o={o} v={v} onOpen={onOpen} />
        ))}
        {placed.map((o) => (
          <Plate key={o.building.id} freeBuilder={freeBuilder} now={now} o={o} v={v} onOpen={onOpen} />
        ))}
        {/* A soft vignette ties the edges into the frame */}
        <span className="pointer-events-none absolute inset-0 z-[10001] rounded-2xl shadow-[inset_0_0_40px_rgba(0,0,0,0.45)]" />
      </div>
    </div>
  );
};
