"use client";
import clsx from "clsx";

import { UNITS, UnitId, UNIT_BY_ID } from "@/lib/game/config";
import { Segmented } from "@/components/atoms/Ui";
import type { Army } from "@/lib/game/engine";

export const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

export const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={clsx("card p-3", className)}>
    {children}
  </div>
);

/** Painted troop portrait (public/images/troops/<id>.webp). */
export const unitImage = (unit: UnitId) => `/images/troops/${unit}.webp`;

/** A troop's icon sized to the surrounding text. */
export const UnitEmoji = ({ unit }: { unit: UnitId }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    alt={UNIT_BY_ID[unit].name}
    className="inline-block align-[-0.3em] w-[1.45em] h-[1.45em] object-contain"
    draggable={false}
    src={unitImage(unit)}
  />
);

export const UnitBadge = ({ unit, size = 36, rank = 0 }: { unit: UnitId; size?: number; rank?: number }) => (
  <div
    className="relative rounded-full bg-panel border-2 border-gold shrink-0"
    style={{ width: size, height: size }}
  >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      alt={UNIT_BY_ID[unit].name}
      className="w-full h-full rounded-full object-contain p-[8%]"
      draggable={false}
      src={unitImage(unit)}
    />
    {/* One star per rank, on a little gold tab under the badge. */}
    {rank > 0 && (
      <span
        className="absolute left-1/2 -translate-x-1/2 rounded-full bg-gold text-[#1A120B] leading-none px-1 py-px whitespace-nowrap"
        style={{ bottom: -size * 0.16, fontSize: Math.max(7, size * 0.17) }}
      >
        {"★".repeat(rank)}
      </span>
    )}
  </div>
);

/** "🛡️ 12  🏹 3" — only units with a count. */
export const ArmyLine = ({ army, className }: { army: Army; className?: string }) => {
  const parts = UNITS.filter((u) => (army[u.id] ?? 0) > 0);

  if (!parts.length) return <span className={clsx("text-muted", className)}>none</span>;

  return (
    <span className={clsx("inline-flex flex-wrap gap-x-2", className)}>
      {parts.map((u) => (
        <span key={u.id}>
          <UnitEmoji unit={u.id} /> {fmt(army[u.id])}
        </span>
      ))}
    </span>
  );
};

/** War screen tabs: the shared v2 segmented control. */
export const Tabs = Segmented;

export const Stepper = ({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
}) => {
  const set = (n: number) => onChange(Math.max(0, Math.min(max, Math.floor(n || 0))));

  return (
    <div className="flex items-center gap-1">
      <button aria-label="One less" className="btn btn-wood btn-sm w-8 px-0" type="button" onClick={() => set(value - 1)}>
        −
      </button>
      <input
        className="inset w-12 h-8 text-center text-sm font-extrabold tabular-nums outline-none focus:border-gold"
        inputMode="numeric"
        value={value}
        onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")))}
      />
      <button aria-label="One more" className="btn btn-wood btn-sm w-8 px-0" type="button" onClick={() => set(value + 1)}>
        +
      </button>
      <button className="btn btn-ghost btn-sm px-2.5" type="button" onClick={() => set(max)}>
        Max
      </button>
    </div>
  );
};
