"use client";
import clsx from "clsx";

import { UNITS, UnitId, UNIT_BY_ID } from "@/lib/game/config";
import type { Army } from "@/lib/game/engine";

export const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

export const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={clsx("bg-buildingBg rounded-2xl border border-line p-3", className)}>
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
    className="inline-block align-[-0.3em] w-[1.35em] h-[1.35em] rounded-[0.3em] object-cover"
    draggable={false}
    src={unitImage(unit)}
  />
);

export const UnitBadge = ({ unit, size = 36, rank = 0 }: { unit: UnitId; size?: number; rank?: number }) => (
  <div
    className="relative rounded-full bg-[#1E1610] border-2 border-[#E3A948] shrink-0"
    style={{ width: size, height: size }}
  >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      alt={UNIT_BY_ID[unit].name}
      className="w-full h-full rounded-full object-cover"
      draggable={false}
      src={unitImage(unit)}
    />
    {/* One star per rank, on a little gold tab under the badge. */}
    {rank > 0 && (
      <span
        className="absolute left-1/2 -translate-x-1/2 rounded-full bg-[#E3A948] text-[#1A120B] leading-none px-1 py-px whitespace-nowrap"
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

  if (!parts.length) return <span className={clsx("text-[#B19C80]", className)}>none</span>;

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

export const Tabs = <T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; badge?: number }[];
  value: T;
  onChange: (t: T) => void;
}) => (
  <div className="flex w-full bg-panel border border-line rounded-xl p-1 gap-1">
    {tabs.map((t) => (
      <button
        key={t.id}
        className={clsx(
          "flex-1 h-9 rounded-[9px] text-sm font-bold relative",
          value === t.id ? "bg-gold text-[#1A120B] font-extrabold" : "text-muted"
        )}
        onClick={() => onChange(t.id)}
      >
        {t.label}
        {!!t.badge && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center bg-ember text-[#FFF4EA] text-[10px] leading-none tabular-nums rounded-full min-w-4 h-4 px-1">
            {t.badge}
          </span>
        )}
      </button>
    ))}
  </div>
);

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
      <button className="w-7 h-7 rounded bg-[#1E1610] font-bold" onClick={() => set(value - 1)}>
        −
      </button>
      <input
        className="w-12 h-7 rounded bg-[#1E1610] text-center text-sm font-bold outline-none"
        inputMode="numeric"
        value={value}
        onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")))}
      />
      <button className="w-7 h-7 rounded bg-[#1E1610] font-bold" onClick={() => set(value + 1)}>
        +
      </button>
      <button className="h-7 px-2 rounded bg-[#1E1610] text-xs font-bold" onClick={() => set(max)}>
        Max
      </button>
    </div>
  );
};
