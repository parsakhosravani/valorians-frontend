"use client";

import clsx from "clsx";
import { FunctionComponent, useEffect, useId, useRef, useState } from "react";

import { BuildingDef, buildingImage } from "@/lib/game/config";
import { UpgradeOption, canStart } from "@/lib/game/advice";
import { formatDuration } from "@/lib/format";

/**
 * A walled village in the Travian manner: the Town Hall in the middle, the
 * village's buildings in rings around it, a round palisade with the City Gate
 * and Watchtower set into it, and the fields, mines and harbor outside.
 *
 * Everything is in village units: the village is 100 units wide and `height`
 * tall. A plot's point is the foot of its building.
 */
type Pt = { x: number; y: number };

type Layout = {
  height: number;
  /** Building width. */
  size: number;
  /** Name plate text size, in px. */
  label: number;
  /** Widest a name plate may get, in village units. */
  plate: number;
  /** The palisade. */
  wall: { cx: number; cy: number; rx: number; ry: number };
  /** Where the Town Hall square is. */
  plaza: Pt;
  plots: Record<string, Pt>;
  /** Clumps of trees outside the wall: x, y, radius. */
  woods: [number, number, number][];
  /** Tilled fields outside the wall: x, y, width, height, angle. */
  fields: [number, number, number, number, number][];
};

/** Point on an ellipse; 90° is the front (bottom), 270° the back. */
const ring = (cx: number, cy: number, rx: number, ry: number, deg: number): Pt => ({
  x: +(cx + rx * Math.cos((deg * Math.PI) / 180)).toFixed(2),
  y: +(cy + ry * Math.sin((deg * Math.PI) / 180)).toFixed(2),
});

const around = (cx: number, cy: number, rx: number, ry: number, spots: [string, number][]) =>
  Object.fromEntries(spots.map(([id, deg]) => [id, ring(cx, cy, rx, ry, deg)]));

/** Desktop: a wide, oval village. */
const WIDE: Layout = (() => {
  const cx = 50;
  const cy = 43;
  const wall = { cx, cy, rx: 44, ry: 29 };

  return {
    height: 80,
    size: 10,
    label: 11,
    plate: 14,
    wall,
    plaza: { x: cx, y: cy + 5 },
    plots: {
      "town-hall": { x: cx, y: cy + 2 },
      // Inner ring: the civic buildings, the market and the war council. The street to the gate runs through the front gap.
      ...around(cx, cy, 21, 13.5, [
        ["resource-warehouse", 207],
        ["treasury", 258],
        ["academy", 284],
        ["embassy", 333],
        ["trading-post", 27],
        ["war-hall", 62],
        ["military-command", 118],
        ["hospital", 153],
      ]),
      // Outer ring, inside the wall: workshops and the troops' quarters.
      ...around(cx, cy, 34, 22, [
        ["barracks", 0],
        ["stable", 36],
        ["siege-workshop", 144],
        ["arsenal", 180],
        ["hideout", 216],
        ["exploration-center", 242],
        ["trapmaker", 298],
        ["armory", 324],
      ]),
      // On the wall.
      "city-gate": ring(cx, cy, wall.rx, wall.ry, 90),
      watchtower: ring(cx, cy, wall.rx, wall.ry, 58),
      // Outside the wall.
      sawmill: { x: 15, y: 12 },
      "iron-mine": { x: 7, y: 24 },
      windmill: { x: 85, y: 12 },
      brickyard: { x: 93, y: 24 },
      "fertilizer-workshop": { x: 92, y: 71 },
      harbor: { x: 9, y: 74 },
    },
    woods: [
      [30, 5, 4],
      [69, 4.5, 3.5],
      [97, 6, 3.5],
      [3, 4, 3.5],
      [3, 48, 4.5],
      [97, 49, 4],
      [78, 78, 3.5],
    ],
    fields: [
      [50, 5.5, 10, 5, -4],
      [3.5, 36, 5, 9, 0],
      [96.5, 36, 5, 9, 0],
      [70, 77, 8, 4, 6],
    ],
  };
})();

/** Phone: the same village, stood upright. */
const NARROW: Layout = (() => {
  const wall = { cx: 50, cy: 128, rx: 46, ry: 84 };

  return {
    height: 230,
    size: 19,
    label: 10,
    plate: 21,
    wall,
    plaza: { x: 50, y: 131 },
    plots: {
      // Outside the wall, at the back: mines and fields.
      "iron-mine": { x: 17, y: 18 },
      sawmill: { x: 50, y: 14 },
      brickyard: { x: 83, y: 18 },
      windmill: { x: 28, y: 39 },
      "fertilizer-workshop": { x: 72, y: 39 },
      // Inside, from the back to the gate.
      hideout: { x: 33, y: 68 },
      "resource-warehouse": { x: 67, y: 68 },
      academy: { x: 20, y: 91 },
      treasury: { x: 50, y: 92 },
      "trading-post": { x: 80, y: 91 },
      embassy: { x: 19, y: 116 },
      "town-hall": { x: 50, y: 122 },
      "exploration-center": { x: 81, y: 116 },
      "war-hall": { x: 17, y: 145 },
      hospital: { x: 37, y: 149 },
      "military-command": { x: 63, y: 149 },
      barracks: { x: 83, y: 145 },
      stable: { x: 20, y: 172 },
      arsenal: { x: 40, y: 176 },
      armory: { x: 60, y: 176 },
      "siege-workshop": { x: 80, y: 172 },
      // Left of the gate, clear of it.
      trapmaker: { x: 28, y: 193 },
      // On the wall.
      watchtower: ring(wall.cx, wall.cy, wall.rx, wall.ry, 58),
      "city-gate": ring(wall.cx, wall.cy, wall.rx, wall.ry, 90),
      // On the shore.
      harbor: { x: 13, y: 219 },
    },
    woods: [
      [4, 4, 7],
      [96, 5, 6],
      [3, 62, 6],
      [97, 64, 6],
      [2, 128, 5],
      [98, 120, 5],
      [96, 214, 6],
    ],
    fields: [
      [33, 4, 14, 6, -6],
      [67, 4, 14, 6, 6],
      [8, 95, 8, 14, 0],
      [92, 95, 8, 14, 0],
    ],
  };
})();

/** Wider than this (in px), the village switches to the wide layout. */
const WIDE_FROM = 600;

/** A few landmarks are drawn bigger. */
const BIG: Record<string, number> = { "town-hall": 1.35, "city-gate": 1.1 };

const sizeOf = (v: Layout, id: string) => v.size * (BIG[id] ?? 1);

/** The ground: grass, the wall, lanes, woods, fields and the shore. */
const Ground = ({ v }: { v: Layout }) => {
  const id = useId().replace(/:/g, "");
  const u = (name: string) => `url(#${id}-${name})`;
  const H = v.height;
  const { cx, cy, rx, ry } = v.wall;
  const hall = v.plots["town-hall"];
  const gate = v.plots["city-gate"];
  const harbor = v.plots["harbor"];
  // The gap the gate fills, as an arc from just left of it to just right of it.
  const gl = ring(cx, cy, rx, ry, 99);
  const gr = ring(cx, cy, rx, ry, 81);

  return (
    <svg aria-hidden="true" className="absolute inset-0 w-full h-full" viewBox={`0 0 100 ${H}`}>
      <defs>
        <radialGradient cx="50%" cy="50%" gradientTransform="translate(0 0)" id={`${id}-grass`} r="75%">
          <stop offset="0" stopColor="#62702F" />
          <stop offset="0.55" stopColor="#4C5A28" />
          <stop offset="1" stopColor="#2C3419" />
        </radialGradient>
        <radialGradient id={`${id}-inside`}>
          <stop offset="0" stopColor="#8C7348" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#7A6A3E" stopOpacity="0.25" />
          <stop offset="1" stopColor="#6A6A33" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-plaza`}>
          <stop offset="0" stopColor="#A07E50" />
          <stop offset="0.7" stopColor="#8C6B42" stopOpacity="0.8" />
          <stop offset="1" stopColor="#8C6B42" stopOpacity="0" />
        </radialGradient>
        <radialGradient cx="40%" cy="35%" id={`${id}-tree`}>
          <stop offset="0" stopColor="#4F6A2C" />
          <stop offset="0.6" stopColor="#2F4419" />
          <stop offset="1" stopColor="#1A2610" />
        </radialGradient>
        <linearGradient id={`${id}-sea`} x1="0" x2="1" y1="1" y2="0">
          <stop offset="0" stopColor="#173546" />
          <stop offset="1" stopColor="#2F5664" />
        </linearGradient>
        <pattern height="1.6" id={`${id}-rows`} patternTransform="rotate(90)" patternUnits="userSpaceOnUse" width="1.6">
          <rect fill="#9C8A3E" height="1.6" width="1.6" />
          <rect fill="#7C6E2E" height="1.6" width="0.6" />
        </pattern>
        {/* Rough, painterly edges for lanes, fields and the shore */}
        <filter id={`${id}-rough`}>
          <feTurbulence baseFrequency="0.35" numOctaves="2" seed="7" type="fractalNoise" />
          <feDisplacementMap in="SourceGraphic" scale="1.2" />
        </filter>
        {/* Patchy grass */}
        <filter height="100%" id={`${id}-patches`} width="100%" x="0" y="0">
          <feTurbulence baseFrequency="0.06" numOctaves="3" seed="11" type="fractalNoise" />
          <feColorMatrix values="0 0 0 0 0.12  0 0 0 0 0.16  0 0 0 0 0.05  0 0 0 1.4 -0.55" />
        </filter>
        <filter height="100%" id={`${id}-grain`} width="100%" x="0" y="0">
          <feTurbulence baseFrequency="0.9" numOctaves="2" seed="4" type="fractalNoise" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.3 0" />
        </filter>
        <filter id={`${id}-shadow`}>
          <feGaussianBlur stdDeviation="0.5" />
        </filter>
      </defs>

      {/* Grass, darker toward the edges, in patches */}
      <rect fill={u("grass")} height={H} width="100" />
      <rect filter={u("patches")} height={H} width="100" />

      {/* Sea in the corner by the Harbor */}
      <path
        d={`M0 ${harbor.y - 15} Q${harbor.x + 2} ${harbor.y - 10} ${harbor.x + 4} ${harbor.y - 2} Q${harbor.x + 8} ${H - 3} ${harbor.x + 16} ${H} L0 ${H} Z`}
        fill="#8C7A52"
        filter={u("rough")}
      />
      <path
        d={`M0 ${harbor.y - 13} Q${harbor.x} ${harbor.y - 8.5} ${harbor.x + 2.5} ${harbor.y - 1} Q${harbor.x + 6} ${H - 2.5} ${harbor.x + 14} ${H} L0 ${H} Z`}
        fill={u("sea")}
        filter={u("rough")}
      />

      {/* Tilled fields */}
      {v.fields.map(([x, y, w, h, a], i) => (
        <g key={i} filter={u("rough")} transform={`rotate(${a} ${x} ${y})`}>
          <rect fill={u("rows")} height={h} opacity="0.75" rx="0.8" width={w} x={x - w / 2} y={y - h / 2} />
        </g>
      ))}

      {/* Worn ground inside the wall */}
      <ellipse cx={cx} cy={cy} fill={u("inside")} rx={rx} ry={ry} />

      {/* Lanes: a ring road between the two rings of buildings, and the street from the gate to the square */}
      <g fill="none" filter={u("rough")} stroke="#8A6A40" strokeLinecap="round" strokeOpacity="0.8">
        <ellipse cx={cx} cy={cy} rx={rx * 0.6} ry={ry * 0.58} strokeWidth="1.4" />
        <path
          d={`M${gate.x} ${gate.y} C${gate.x} ${(gate.y + hall.y) / 2 + 4} ${hall.x} ${(gate.y + hall.y) / 2} ${hall.x} ${hall.y + 3}`}
          strokeWidth="2.2"
        />
        <path d={`M${gate.x} ${gate.y} Q${gate.x} ${H - 2} ${gate.x + 6} ${H + 1}`} strokeWidth="2" />
      </g>

      {/* The Town Hall square */}
      <ellipse
        cx={v.plaza.x}
        cy={v.plaza.y}
        fill={u("plaza")}
        filter={u("rough")}
        rx={sizeOf(v, "town-hall") * 0.95}
        ry={sizeOf(v, "town-hall") * 0.42}
      />

      {/* Palisade: shadow, logs, and the gap where the gate stands */}
      <path
        d={`M${gr.x} ${gr.y} A${rx} ${ry} 0 1 0 ${gl.x} ${gl.y}`}
        fill="none"
        filter={u("shadow")}
        stroke="#000"
        strokeOpacity="0.45"
        strokeWidth="2.6"
        transform="translate(0.5 0.8)"
      />
      <path d={`M${gr.x} ${gr.y} A${rx} ${ry} 0 1 0 ${gl.x} ${gl.y}`} fill="none" stroke="#3A2614" strokeLinecap="round" strokeWidth="2.2" />
      <path d={`M${gr.x} ${gr.y} A${rx} ${ry} 0 1 0 ${gl.x} ${gl.y}`} fill="none" stroke="#8A6236" strokeDasharray="0.55 0.35" strokeWidth="1.3" />
      <path
        d={`M${gr.x} ${gr.y} A${rx} ${ry} 0 1 0 ${gl.x} ${gl.y}`}
        fill="none"
        stroke="#C49A5E"
        strokeDasharray="0.55 0.35"
        strokeOpacity="0.55"
        strokeWidth="0.35"
        transform="translate(0 -0.45)"
      />

      {/* Woods */}
      {v.woods.map(([x, y, r], i) => (
        <g key={i}>
          {[
            [-0.45, 0.1, 0.62],
            [0.42, 0.18, 0.58],
            [0, -0.25, 0.66],
            [-0.15, 0.5, 0.5],
            [0.25, 0.55, 0.45],
          ].map(([dx, dy, s], j) => (
            <g key={j}>
              <ellipse cx={x + dx * r + 0.4} cy={y + dy * r + 0.6} fill="#000" filter={u("shadow")} opacity="0.4" rx={r * s} ry={r * s * 0.8} />
              <circle cx={x + dx * r} cy={y + dy * r} fill={u("tree")} filter={u("rough")} r={r * s} />
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

/** The building art itself, layered so nearer buildings overlap farther ones. */
const Art = ({ v, o, now, onOpen }: PlotProps) => {
  const { x, y } = v.plots[o.building.id];
  const size = sizeOf(v, o.building.id);
  const built = o.level > 0;
  const progress = o.job ? Math.min(1, (now - o.job.startedAt) / (o.job.endsAt - o.job.startedAt)) : 0;

  return (
    <button
      aria-label={`${o.building.name}, level ${o.level}`}
      className="group absolute -translate-x-1/2 -translate-y-[72%] aspect-square active:scale-95 transition-transform"
      style={{ ...at(v, x, y), width: `${size}%`, zIndex: Math.round(y * 10) }}
      title={o.building.name}
      onClick={() => onOpen(o.building)}
    >
      {/* Contact shadow on the ground */}
      <span className="absolute left-[12%] right-[12%] bottom-[8%] h-[22%] rounded-[50%] bg-black/45 blur-[3px]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        className={clsx(
          "relative w-full h-full object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] transition-[transform,filter] duration-200",
          "group-hover:-translate-y-[3%] group-hover:drop-shadow-[0_6px_8px_rgba(0,0,0,0.55)] group-hover:brightness-110",
          !built && !o.job && "opacity-50 grayscale-[0.85] brightness-75",
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
 * The "upgrade now" mark: a green gem with a gold rim and a raised double
 * chevron, gently bobbing so ready buildings catch the eye.
 */
const UpgradeMark = ({ size }: { size: number }) => {
  const id = useId().replace(/:/g, "");

  return (
    <svg aria-hidden="true" className="absolute -top-[9px] -right-[2px] animate-nudge drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" height={size} viewBox="0 0 24 24" width={size}>
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
      {/* Double chevron: dark outline, then light face */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.5 12.2 12 7.7l4.5 4.5M7.5 16.6 12 12.1l4.5 4.5" stroke="#1C3410" strokeWidth="4" />
        <path d="M7.5 12.2 12 7.7l4.5 4.5M7.5 16.6 12 12.1l4.5 4.5" stroke="#FFFBEA" strokeWidth="2.2" />
      </g>
      {/* Highlight */}
      <ellipse cx="9" cy="6.6" fill="#fff" opacity="0.35" rx="3.2" ry="1.4" transform="rotate(-25 9 6.6)" />
    </svg>
  );
};

/**
 * A name plate at each building's foot: the level, the building's name, and
 * an upgrade mark pinned to the plate's corner when it can be upgraded now,
 * so the level is never hidden and the plate keeps its size.
 */
const Plate = ({ v, o, freeBuilder, onOpen }: PlotProps) => {
  const { x, y } = v.plots[o.building.id];
  const size = sizeOf(v, o.building.id);
  const built = o.level > 0;
  const ready = !o.job && freeBuilder && canStart(o);

  return (
    <button
      aria-hidden="true"
      className={clsx(
        "absolute -translate-x-1/2 z-[10000] min-w-min flex items-center gap-1 py-[2px] pl-[2px] pr-1.5 rounded-[10px] border",
        "bg-[#1A120B]/85 backdrop-blur-[2px] shadow-[0_1px_4px_rgba(0,0,0,0.7)] transition-colors hover:border-gold",
        ready ? "border-good/70" : built ? "border-frame" : "border-line/60",
      )}
      style={{ ...at(v, x, y + size * 0.2), maxWidth: `${v.plate}%` }}
      tabIndex={-1}
      onClick={() => onOpen(o.building)}
    >
      <span
        className={clsx(
          "shrink-0 rounded-full border flex items-center justify-center font-display font-black leading-none",
          built ? "bg-gold text-[#1A120B] border-[#FBE3A6]" : "bg-panel2 text-muted border-line",
        )}
        style={{ minWidth: v.label + 6, height: v.label + 6, fontSize: v.label - 1 }}
      >
        {o.maxed ? "★" : built ? o.level : "+"}
      </span>
      <span className={clsx("font-bold leading-[1.1] text-left", built || o.job ? "text-parch" : "text-muted")} style={{ fontSize: v.label }}>
        {o.building.name}
      </span>
      {ready && <UpgradeMark size={v.label + 5} />}
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
  const [ref, width] = useWidth();
  const v = width >= WIDE_FROM ? WIDE : NARROW;
  const placed = options.filter((o) => v.plots[o.building.id]);

  return (
    <div
      ref={ref}
      className="relative isolate w-full rounded-2xl overflow-hidden border border-frame/60 shadow-card bg-[#2C3419]"
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
