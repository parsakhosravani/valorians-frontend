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

/** Splits an icon like "🛡️🗡️" into its emoji. */
const emojiParts = (icon: string) =>
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? Array.from(new Intl.Segmenter().segment(icon), (s) => s.segment)
    : [icon];

/** A spear drawn like an emoji (there is no spear emoji): wooden shaft, steel head, red tassel. */
export const SpearGlyph = ({ size = "1em" }: { size?: number | string }) => (
  <svg aria-label="spear" className="inline-block" height={size} role="img" style={{ verticalAlign: "-0.15em" }} viewBox="3 3 26 26" width={size}>
    <defs>
      <linearGradient id="spear-steel" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#F4F7FA" />
        <stop offset="0.5" stopColor="#B9C2CB" />
        <stop offset="1" stopColor="#6B737C" />
      </linearGradient>
      <linearGradient id="spear-wood" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#C68A4A" />
        <stop offset="1" stopColor="#7A4A22" />
      </linearGradient>
    </defs>
    <g transform="rotate(45 16 16)">
      <rect fill="url(#spear-wood)" height="21" rx="1.1" stroke="#3A2210" strokeWidth="0.8" width="2.6" x="14.7" y="10.6" />
      <path d="M16 0.6 L19.4 7.6 L16 11.2 L12.6 7.6 Z" fill="url(#spear-steel)" stroke="#3B4148" strokeLinejoin="round" strokeWidth="0.8" />
      <path d="M16 1.8 V10" stroke="#6B737C" strokeWidth="0.6" />
      <rect fill="#5A5F66" height="2" rx="0.6" stroke="#2B2F35" strokeWidth="0.5" width="3.6" x="14.2" y="10.6" />
      <path d="M14.4 12.8 Q12.4 15 13 17.4 M16 12.8 Q15.6 15.4 16 17.8 M17.6 12.8 Q19.4 15 18.8 17.4" fill="none" stroke="#C9483A" strokeLinecap="round" strokeWidth="1.2" />
    </g>
  </svg>
);

/** A troop's icon at the current font size (the Spearman's is the drawn spear). */
export const UnitEmoji = ({ unit }: { unit: UnitId }) =>
  unit === "spearman" ? <SpearGlyph /> : <>{UNIT_BY_ID[unit].icon}</>;

export const UnitBadge = ({ unit, size = 36, rank = 0 }: { unit: UnitId; size?: number; rank?: number }) => {
  const [first, second] = emojiParts(UNIT_BY_ID[unit].icon);

  return (
    <div
      className="relative rounded-full bg-[#1E1610] border-2 border-[#E3A948] flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {unit === "spearman" ? <SpearGlyph /> : first}
      {/* A second emoji (the Knight's sword) is drawn over the first. */}
      {unit !== "spearman" && second && (
        <span className="absolute" style={{ fontSize: size * 0.38, right: size * 0.12, bottom: size * 0.1 }}>
          {second}
        </span>
      )}
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
};

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
