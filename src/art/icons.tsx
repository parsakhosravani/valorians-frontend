/**
 * Small game icons (resources, stats, actions) in a 32×32 box.
 * Flat 3-tone shapes with the same dark outline as the buildings, so they
 * read at 16–24px. UI navigation icons live in components/atoms/Icons.tsx
 * and use a matching 2px line style instead.
 */
import React from "react";

import { MAT, OUTLINE } from "./palette";

const o = { stroke: OUTLINE, strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

export type GameIconId =
  | "coin"
  | "iron"
  | "wood"
  | "clay"
  | "crop"
  | "population"
  | "builder"
  | "time"
  | "building"
  | "energy"
  | "attack"
  | "defense"
  | "loot"
  | "trophy"
  | "chest"
  | "info"
  | "shield-time";

const ICONS: Record<GameIconId, React.ReactNode> = {
  coin: (
    <>
      <ellipse cx="16" cy="18.5" fill={MAT.gold.right} rx="11" ry="9.5" {...o} />
      <ellipse cx="16" cy="15.5" fill={MAT.gold.left} rx="11" ry="9.5" {...o} />
      <ellipse cx="16" cy="15.5" fill={MAT.gold.top} rx="7" ry="5.8" />
      <path d="M12.5 12.5 16 19l3.5-6.5" fill="none" stroke={MAT.gold.right} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </>
  ),
  iron: (
    <>
      <path d="M5 20 9 12h14l4 8z" fill={MAT.iron.top} {...o} />
      <path d="M5 20h22v4H5z" fill={MAT.iron.left} {...o} />
      <path d="m23 12 4 8v4l-4-8z" fill={MAT.iron.right} {...o} />
      <path d="M11 14.5h7" stroke="#fff" strokeLinecap="round" strokeOpacity="0.6" strokeWidth="1.4" />
    </>
  ),
  wood: (
    <>
      <rect fill={MAT.wood.left} height="7" rx="3.5" width="20" x="4" y="17" {...o} />
      <rect fill={MAT.wood.top} height="7" rx="3.5" width="20" x="8" y="9" {...o} />
      <ellipse cx="24.5" cy="12.5" fill="#E8C189" rx="3" ry="3.5" {...o} />
      <ellipse cx="20.5" cy="20.5" fill="#E8C189" rx="3" ry="3.5" {...o} />
      <circle cx="24.5" cy="12.5" fill={MAT.wood.right} r="1" />
      <circle cx="20.5" cy="20.5" fill={MAT.wood.right} r="1" />
    </>
  ),
  clay: (
    <>
      <path d="M4 17h12v7H4z" fill={MAT.brick.left} {...o} />
      <path d="M16 17h12v7H16z" fill={MAT.brick.right} {...o} />
      <path d="M10 10h12v7H10z" fill={MAT.brick.left} {...o} />
      <path d="M10 10l2-2h12l-2 2zM22 10l2-2v7l-2 2z" fill={MAT.brick.top} {...o} />
    </>
  ),
  crop: (
    <>
      <path d="M16 28V9" stroke={OUTLINE} strokeLinecap="round" strokeWidth="3.2" />
      <path d="M16 28V9" stroke={MAT.crop.right} strokeLinecap="round" strokeWidth="1.4" />
      {[8, 12.5, 17].map((y) => (
        <g key={y}>
          <ellipse cx="12.5" cy={y + 1} fill={MAT.crop.left} rx="3" ry="2" transform={`rotate(-35 12.5 ${y + 1})`} {...o} strokeWidth={1.2} />
          <ellipse cx="19.5" cy={y + 1} fill={MAT.crop.top} rx="3" ry="2" transform={`rotate(35 19.5 ${y + 1})`} {...o} strokeWidth={1.2} />
        </g>
      ))}
      <ellipse cx="16" cy="5.5" fill={MAT.crop.top} rx="2" ry="3" {...o} strokeWidth={1.2} />
    </>
  ),
  population: (
    <>
      <circle cx="11" cy="11" fill="#E9C29A" r="4.5" {...o} />
      <path d="M3.5 26c0-5 3.3-8.5 7.5-8.5s7.5 3.5 7.5 8.5z" fill={MAT.blueCloth.left} {...o} />
      <circle cx="21.5" cy="12.5" fill="#E9C29A" r="4" {...o} />
      <path d="M15 26c.4-4.4 3.2-7.2 6.5-7.2S28 21.6 28.5 26z" fill={MAT.redCloth.left} {...o} />
    </>
  ),
  builder: (
    <>
      <path d="m8 25 10-10" stroke={OUTLINE} strokeLinecap="round" strokeWidth="5" />
      <path d="m8 25 10-10" stroke={MAT.wood.top} strokeLinecap="round" strokeWidth="2.6" />
      <path d="M14 8.5 20.5 4l7 7-4.5 6.5z" fill={MAT.iron.left} {...o} />
      <path d="M20.5 4l7 7-2 3-7-7z" fill={MAT.iron.top} {...o} />
    </>
  ),
  time: (
    <>
      <path d="M8 4h16M8 28h16" stroke={OUTLINE} strokeLinecap="round" strokeWidth="3" />
      <path d="M8 4h16M8 28h16" stroke={MAT.wood.top} strokeLinecap="round" strokeWidth="1.4" />
      <path d="M10 5.5c0 6 6 7 6 10.5s-6 4.5-6 10.5h12c0-6-6-7-6-10.5s6-4.5 6-10.5z" fill={MAT.cloth.top} {...o} />
      <path d="M12.5 24.5c.5-2.5 3.5-3 3.5-5 0 2 3 2.5 3.5 5zM13 9h6c-.5 1.6-3 2.6-3 4-0 -1.4-2.5-2.4-3-4z" fill={MAT.crop.left} />
    </>
  ),
  building: (
    <>
      <path d="M5 15h22v12H5z" fill={MAT.plaster.left} {...o} />
      <path d="M3 16 16 5l13 11z" fill={MAT.redRoof.left} {...o} />
      <path d="M13 27v-6.5a3 3 0 0 1 6 0V27z" fill={MAT.darkWood.left} {...o} />
    </>
  ),
  energy: (
    <>
      <path d="M18 3 6 18h8l-2 11 13-16h-8z" fill={MAT.gold.left} {...o} />
      <path d="M18 3 14 14h5" fill="none" stroke={MAT.gold.top} strokeLinecap="round" strokeWidth="1.4" />
    </>
  ),
  attack: (
    <>
      <path d="M24 4h4v4L13 23l-4-4z" fill={MAT.iron.top} {...o} />
      <path d="m7 17 8 8M5 27l5-5" stroke={OUTLINE} strokeLinecap="round" strokeWidth="4" />
      <path d="m7 17 8 8" stroke={MAT.gold.left} strokeLinecap="round" strokeWidth="2" />
      <path d="M5 27l5-5" stroke={MAT.wood.left} strokeLinecap="round" strokeWidth="2" />
    </>
  ),
  defense: (
    <>
      <path d="M16 3 27 7v8c0 7-5 11.5-11 14C10 26.5 5 22 5 15V7z" fill={MAT.blueCloth.left} {...o} />
      <path d="M16 3v26C10 26.5 5 22 5 15V7z" fill={MAT.blueCloth.top} />
      <path d="M16 3 27 7v8c0 7-5 11.5-11 14C10 26.5 5 22 5 15V7z" fill="none" {...o} />
      <path d="M16 9v14M10 14h12" stroke={MAT.gold.top} strokeLinecap="round" strokeWidth="2" />
    </>
  ),
  loot: (
    <>
      <path d="M8 12c0-4 3.6-7 8-7s8 3 8 7" fill="none" stroke={OUTLINE} strokeWidth="2" />
      <path d="M5 14c0-2 2-3 4-3h14c2 0 4 1 4 3l-2 12c-.3 1.6-1.6 2.5-3 2.5H10c-1.4 0-2.7-.9-3-2.5z" fill={MAT.wood.top} {...o} />
      <circle cx="16" cy="19" fill={MAT.gold.top} r="3.4" {...o} strokeWidth={1.2} />
    </>
  ),
  trophy: (
    <>
      <path d="M9 4h14v7a7 7 0 0 1-14 0z" fill={MAT.gold.left} {...o} />
      <path d="M9 7H5c0 4 2 6 5 6M23 7h4c0 4-2 6-5 6" fill="none" {...o} />
      <path d="M13 22h6l1 4h-8z" fill={MAT.gold.right} {...o} />
      <path d="M9 27h14v2H9z" fill={MAT.darkWood.left} {...o} />
      <path d="M12 6v5" stroke={MAT.gold.top} strokeLinecap="round" strokeWidth="1.6" />
    </>
  ),
  chest: (
    <>
      <path d="M4 14h24v13H4z" fill={MAT.wood.left} {...o} />
      <path d="M4 14c0-5 3-8 12-8s12 3 12 8z" fill={MAT.wood.top} {...o} />
      <path d="M4 14h24" stroke={MAT.gold.left} strokeWidth="2.4" />
      <path d="M13 12h6v7h-6z" fill={MAT.gold.top} {...o} />
    </>
  ),
  info: (
    <>
      <circle cx="16" cy="16" fill={MAT.blueCloth.left} r="12" {...o} />
      <path d="M16 15v7" stroke="#fff" strokeLinecap="round" strokeWidth="3" />
      <circle cx="16" cy="10.5" fill="#fff" r="1.9" />
    </>
  ),
  "shield-time": (
    <>
      <path d="M16 3 27 7v8c0 7-5 11.5-11 14C10 26.5 5 22 5 15V7z" fill={MAT.greenRoof.left} {...o} />
      <circle cx="16" cy="15" fill={MAT.cloth.top} r="6" {...o} strokeWidth={1.2} />
      <path d="M16 12v3.4l2 1.6" stroke={OUTLINE} strokeLinecap="round" strokeWidth="1.5" fill="none" />
    </>
  ),
};

export const GameIcon = ({
  id,
  size = 20,
  className,
  title,
}: {
  id: GameIconId;
  size?: number;
  className?: string;
  title?: string;
}) => (
  <svg
    aria-hidden={title ? undefined : true}
    className={className}
    height={size}
    role={title ? "img" : undefined}
    viewBox="0 0 32 32"
    width={size}
  >
    {title && <title>{title}</title>}
    {ICONS[id]}
  </svg>
);
