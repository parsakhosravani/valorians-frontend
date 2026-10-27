"use client";
import Image from "next/image";
import clsx from "clsx";

import { UnitEmoji, fmt } from "./shared";

import { RESOURCES } from "@/context";
import { formatDuration } from "@/lib/format";
import { UNITS, UnitId } from "@/lib/game/config";
import type { Army } from "@/lib/game/engine";
import { GameIcon } from "@/components/atoms/GameIcon";

type Pt = { x: number; y: number };

const IMG = Object.fromEntries(RESOURCES.map((r) => [r.id, r.img]));

/** How far along its road something is (0 at home, 1 on arrival). */
export const progress = (now: number, sentAt: number, arrivesAt: number) =>
  Math.min(1, Math.max(0, (now - sentAt) / Math.max(1, arrivesAt - sentAt)));

const lerp = (a: Pt, b: Pt, p: number) => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
});

/**
 * A road on the map: its corners (px) and, for each corner, how far through
 * the trip (0..1, in time) the traveller reaches it.
 */
export type Road = { points: Pt[]; stops: number[] };

const straight = (from: Pt, to: Pt): Road => ({ points: [from, to], stops: [0, 1] });

/** Where on the road the traveller is at `p`, and which corner it last passed. */
const along = (road: Road, p: number) => {
  const { points, stops } = road;
  let k = 0;

  while (k < stops.length - 2 && stops[k + 1] < p) k++;
  const span = stops[k + 1] - stops[k] || 1;
  const t = Math.min(1, Math.max(0, (p - stops[k]) / span));

  return { at: lerp(points[k], points[k + 1] ?? points[k], t), k };
};

/** The troop that makes up most of an army, to carry its banner. */
const leadUnit = (army: Army | null): UnitId | null => {
  if (!army) return null;
  let best: UnitId | null = null;

  for (const u of UNITS) {
    if (u.transport) continue;
    if ((army[u.id] ?? 0) > (best ? (army[best] ?? 0) : 0)) best = u.id;
  }

  return best;
};

/** Troops in an army (ships don't count). */
const total = (army: Army | null) =>
  army ? UNITS.reduce((s, u) => s + (u.transport ? 0 : (army[u.id] ?? 0)), 0) : 0;

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
    <div className="map-pin -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
      {children}
    </div>
  </div>
);

/** An army on the march: a war banner with its lead troop, size and time left. */
export const ArmyToken = ({
  from,
  to,
  road,
  p,
  units,
  incoming,
  left,
  atSea = false,
  onClick,
}: {
  from: Pt;
  to: Pt;
  /** The winding road; a straight line when left out. */
  road?: Road;
  p: number;
  units: Army | null;
  incoming: boolean;
  left: number;
  /** Out on the water right now: the army shows as a Longship. */
  atSea?: boolean;
  /** Your own armies can be tapped to give them orders. */
  onClick?: () => void;
}) => {
  const lead = leadUnit(units);
  const n = total(units);
  const Tag = onClick ? "button" : "span";

  return (
    <Rider at={along(road ?? straight(from, to), p).at} z={onClick ? 6 : 5}>
      <Tag
        {...(onClick ? { "aria-label": "Army orders", type: "button" as const, onClick } : {})}
        className={clsx("relative flex items-center justify-center", onClick && "pointer-events-auto cursor-pointer active:scale-95 transition-transform")}
      >
        {incoming && (
          <span className="absolute inset-0 rounded-full bg-[#F06A44]/50 animate-ping" />
        )}
        <span
          className={clsx(
            "relative w-9 h-9 rounded-full flex items-center justify-center text-lg border-[3px] shadow-[0_3px_6px_rgba(0,0,0,0.6)]",
            incoming
              ? "bg-gradient-to-b from-[#5A1E12] to-[#2A140E] border-[#F06A44]"
              : "bg-gradient-to-b from-[#3A2A1B] to-[#1E1610] border-gold",
          )}
        >
          <span className={atSea ? "animate-sail" : "animate-trot"}>
            {atSea ? <UnitEmoji unit="longship" /> : lead ? <UnitEmoji unit={lead} /> : <GameIcon e="⚔️" />}
          </span>
          {n > 0 && (
            <span
              className={clsx(
                "absolute -bottom-1.5 -right-2 min-w-[18px] h-[16px] px-1 rounded-full text-[9px] font-black flex items-center justify-center",
                incoming ? "bg-[#F06A44] text-[#FFF4EA]" : "bg-gold text-[#1A120B]",
              )}
            >
              {n >= 1000 ? `${Math.floor(n / 1000)}k` : n}
            </span>
          )}
        </span>
      </Tag>
      <span
        className={clsx(
          "mt-1 px-1.5 rounded-full text-[9px] font-black whitespace-nowrap border",
          incoming
            ? "bg-[#2A140E] text-[#FFB27A] border-[#8A3B23]"
            : "bg-panel/90 text-goldtext border-line",
        )}
      >
        {formatDuration(left)}
      </span>
    </Rider>
  );
};

/** A merchant's camel carrying a load across the map. */
export const CaravanToken = ({
  from,
  to,
  p,
  resource,
  amount,
  kind,
  left,
  road,
}: {
  from: Pt;
  to: Pt;
  /** The road it follows (the painted one on the map); straight when left out. */
  road?: Road;
  p: number;
  resource: string;
  amount: number;
  kind: "coming" | "going" | "other";
  left: number;
}) => {
  const mine = kind !== "other";
  const img = IMG[resource];

  return (
    <Rider at={along(road ?? straight(from, to), p).at} z={mine ? 4 : 3}>
      <span
        className={clsx(
          "relative leading-none drop-shadow-[0_3px_3px_rgba(0,0,0,0.7)]",
          mine ? "text-[26px]" : "text-[20px] opacity-80",
        )}
      >
        {/* The camel emoji faces left: turn it to face where it's going. */}
        <span
          className="inline-block animate-trot"
          style={{ transform: to.x > from.x ? "scaleX(-1)" : undefined }}
        >
          <GameIcon e="🐪" />
        </span>
      </span>
      {mine && (
        <span
          className={clsx(
            "-mt-0.5 flex items-center gap-0.5 pl-0.5 pr-1.5 rounded-full text-[9px] font-black whitespace-nowrap border",
            kind === "coming"
              ? "bg-[#1C2A14]/95 text-good border-[#5E7F45]"
              : "bg-panel/90 text-sub border-line",
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
