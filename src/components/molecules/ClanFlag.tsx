import React, { useId } from "react";

import { ClanFlag as Flag, FLAG_COLORS, FlagPattern, emblemImage } from "@/lib/game/clan";

/** The pattern drawn over the field, in a 40×44 box (the banner cloth). */
const PATTERN: Record<FlagPattern, (fg: string) => React.ReactNode> = {
  plain: () => null,
  cross: (fg) => (
    <>
      <rect fill={fg} height="44" width="6" x="11" y="0" />
      <rect fill={fg} height="6" width="40" x="0" y="16" />
    </>
  ),
  fess: (fg) => <rect fill={fg} height="12" width="40" x="0" y="14" />,
  pale: (fg) => <rect fill={fg} height="44" width="12" x="14" y="0" />,
  split: (fg) => <rect fill={fg} height="44" width="20" x="20" y="0" />,
  chevron: (fg) => <path d="M0 26 L20 10 L40 26 L40 36 L20 20 L0 36 Z" fill={fg} />,
  saltire: (fg) => (
    <path d="M0 0 L40 44 M40 0 L0 44" fill="none" stroke={fg} strokeWidth="6" />
  ),
  quarters: (fg) => (
    <>
      <rect fill={fg} height="20" width="20" x="20" y="0" />
      <rect fill={fg} height="24" width="20" x="0" y="20" />
    </>
  ),
  border: (fg) => <path d="M3 3 H37 V38 L20 33 L3 38 Z" fill="none" stroke={fg} strokeWidth="3.5" />,
};

/**
 * A clan's war banner: cloth hanging from a crossbar, notched at the bottom,
 * with the clan's colours, pattern and emblem.
 */
export const ClanFlag = ({
  flag,
  size = 32,
  className,
  title,
}: {
  flag: Flag;
  /** Height in px; width follows the banner's shape. */
  size?: number;
  className?: string;
  title?: string;
}) => {
  const id = useId().replace(/:/g, "");
  const bg = FLAG_COLORS[flag.bg] ?? FLAG_COLORS[0];
  const fg = FLAG_COLORS[flag.fg] ?? FLAG_COLORS[2];
  const emblem = flag.emblem >= 0 ? emblemImage(flag.emblem) : null;
  // Cloth shape: square top, notched (swallow-tail) bottom.
  const cloth = "M0 0 H40 V44 L20 37 L0 44 Z";

  return (
    <svg
      aria-label={title ?? "Clan flag"}
      className={className}
      height={size}
      role="img"
      viewBox="-4 -6 48 56"
      width={(size * 48) / 56}
    >
      <defs>
        <clipPath id={`cloth-${id}`}>
          <path d={cloth} />
        </clipPath>
        <linearGradient id={`fold-${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.18" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0.06" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
      </defs>

      {/* Crossbar with gilded ends */}
      <rect fill="#6B4425" height="3.4" rx="1.4" stroke="#2B1A0D" strokeWidth="0.8" width="46" x="-3" y="-4.4" />
      <circle cx="-3" cy="-2.7" fill="#E3A948" r="2.2" stroke="#7A5418" strokeWidth="0.6" />
      <circle cx="43" cy="-2.7" fill="#E3A948" r="2.2" stroke="#7A5418" strokeWidth="0.6" />

      <g clipPath={`url(#cloth-${id})`}>
        <rect fill={bg} height="44" width="40" x="0" y="0" />
        {PATTERN[flag.pattern]?.(fg)}
        <rect fill={`url(#fold-${id})`} height="44" width="40" x="0" y="0" />
      </g>
      <path d={cloth} fill="none" stroke="#1A120B" strokeLinejoin="round" strokeWidth="1.4" />

      {emblem && (
        <>
          <circle cx="20" cy="19" fill={bg} r="10" stroke={fg} strokeWidth="1.6" />
          <image height="16" href={emblem} preserveAspectRatio="xMidYMid meet" width="16" x="12" y="11" />
        </>
      )}
    </svg>
  );
};
