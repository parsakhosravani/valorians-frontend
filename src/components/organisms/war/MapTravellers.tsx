"use client";
import Image from "next/image";
import clsx from "clsx";

import { fmt } from "./shared";

import { RESOURCES } from "@/context";
import { formatDuration } from "@/lib/format";
import { BUILDING_BY_ID, UNITS, buildingImage } from "@/lib/game/config";
import type { Army } from "@/lib/game/engine";

type Pt = { x: number; y: number };

const IMG = Object.fromEntries(RESOURCES.map((r) => [r.id, r.img]));
const ARMY_ART = buildingImage(BUILDING_BY_ID["military-command"]);
const MERCHANT_ART = buildingImage(BUILDING_BY_ID["trading-post"]);

/** How far along its road something is (0 at home, 1 on arrival). */
export const progress = (now: number, sentAt: number, arrivesAt: number) =>
  Math.min(1, Math.max(0, (now - sentAt) / Math.max(1, arrivesAt - sentAt)));

const lerp = (a: Pt, b: Pt, p: number) => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
});

const total = (army: Army | null) =>
  army ? UNITS.reduce((s, u) => s + (army[u.id] ?? 0), 0) : 0;

export const ROUTE_COLORS = {
  outgoing: "#F2C66D",
  incoming: "#F06A44",
  coming: "#9DD07F",
  going: "#E9D3A1",
  other: "#D8C9AE",
} as const;

/**
 * A road on the map (SVG): the stretch already walked is faint, the stretch
 * ahead is a dashed trail that flows toward the target.
 */
export const Route = ({
  from,
  to,
  p,
  color,
  merchant,
  faint,
}: {
  from: Pt;
  to: Pt;
  p: number;
  color: string;
  merchant?: boolean;
  faint?: boolean;
}) => {
  const at = lerp(from, to, p);

  return (
    <g opacity={faint ? 0.45 : 1}>
      {/* road bed */}
      <line
        stroke="#1A120B"
        strokeLinecap="round"
        strokeOpacity="0.35"
        strokeWidth={merchant ? 6 : 7}
        x1={from.x}
        x2={to.x}
        y1={from.y}
        y2={to.y}
      />
      {/* walked */}
      <line
        stroke={color}
        strokeLinecap="round"
        strokeOpacity="0.35"
        strokeWidth={merchant ? 2 : 3}
        x1={from.x}
        x2={at.x}
        y1={from.y}
        y2={at.y}
      />
      {/* ahead */}
      <line
        className="animate-route"
        stroke={color}
        strokeDasharray={merchant ? "1.5 7.5" : "5 4"}
        strokeLinecap="round"
        strokeWidth={merchant ? 3.5 : 3}
        x1={at.x}
        x2={to.x}
        y1={at.y}
        y2={to.y}
      />
      {/* destination */}
      {!faint && (
        <circle
          cx={to.x}
          cy={to.y}
          fill="none"
          r={merchant ? 9 : 12}
          stroke={color}
          strokeDasharray={merchant ? "2 4" : undefined}
          strokeOpacity="0.8"
          strokeWidth="2"
        />
      )}
    </g>
  );
};

/** Places a token on its road, gliding between the once-a-second ticks. */
const Rider = ({
  at,
  z,
  children,
}: {
  at: Pt;
  z?: number;
  children: React.ReactNode;
}) => (
  <div
    className="absolute left-0 top-0 pointer-events-none transition-transform duration-1000 ease-linear"
    style={{ transform: `translate(${at.x}px, ${at.y}px)`, zIndex: z ?? 4 }}
  >
    <div className="-translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
      {children}
    </div>
  </div>
);

/** An army on the march: a war banner with its lead troop, size and time left. */
export const ArmyToken = ({
  from,
  to,
  p,
  units,
  incoming,
  left,
}: {
  from: Pt;
  to: Pt;
  p: number;
  units: Army | null;
  incoming: boolean;
  left: number;
}) => {
  const n = total(units);

  return (
    <Rider at={lerp(from, to, p)} z={5}>
      <span className="relative flex items-center justify-center w-12 h-12">
        {incoming && (
          <span className="absolute inset-1 rounded-full bg-[#F06A44]/45 blur-[6px] animate-pulse" />
        )}
        <Image
          alt=""
          className={clsx(
            "relative w-12 h-12 object-contain animate-trot",
            incoming
              ? "drop-shadow-[0_0_6px_rgba(240,106,68,0.95)]"
              : "drop-shadow-[0_3px_3px_rgba(0,0,0,0.65)]",
          )}
          draggable={false}
          height={96}
          src={ARMY_ART}
          width={96}
        />
        {n > 0 && (
          <span
            className={clsx(
              "absolute bottom-0 -right-1 min-w-[18px] h-[16px] px-1 rounded-full text-[9px] font-black flex items-center justify-center",
              incoming ? "bg-[#F06A44] text-[#FFF4EA]" : "bg-gold text-[#1A120B]",
            )}
          >
            {n >= 1000 ? `${Math.floor(n / 1000)}k` : n}
          </span>
        )}
      </span>
      <span
        className={clsx(
          "-mt-1 px-1.5 rounded-full text-[9px] font-black whitespace-nowrap border",
          incoming
            ? "bg-[#2A140E] text-[#FFB27A] border-[#8A3B23]"
            : "bg-[#1E1610]/90 text-goldtext border-line",
        )}
      >
        {formatDuration(left)}
      </span>
    </Rider>
  );
};

/** A merchant caravan (the Trading Post) carrying a load across the map. */
export const CaravanToken = ({
  from,
  to,
  p,
  resource,
  amount,
  kind,
  left,
}: {
  from: Pt;
  to: Pt;
  p: number;
  resource: string;
  amount: number;
  kind: "coming" | "going" | "other";
  left: number;
}) => {
  const mine = kind !== "other";
  const img = IMG[resource];

  return (
    <Rider at={lerp(from, to, p)} z={mine ? 4 : 3}>
      <Image
        alt=""
        className={clsx(
          "object-contain animate-trot drop-shadow-[0_3px_3px_rgba(0,0,0,0.65)]",
          mine ? "w-10 h-10" : "w-8 h-8 opacity-75",
        )}
        draggable={false}
        height={80}
        src={MERCHANT_ART}
        width={80}
      />
      {mine && (
        <span
          className={clsx(
            "-mt-0.5 flex items-center gap-0.5 pl-0.5 pr-1.5 rounded-full text-[9px] font-black whitespace-nowrap border",
            kind === "coming"
              ? "bg-[#1C2A14]/95 text-good border-[#5E7F45]"
              : "bg-[#1E1610]/90 text-sub border-line",
          )}
        >
          {img && (
            <Image alt="" className="w-3.5 h-3.5 object-contain" draggable={false} height={28} src={img} width={28} />
          )}
          {fmt(amount)} · {formatDuration(left)}
        </span>
      )}
    </Rider>
  );
};
