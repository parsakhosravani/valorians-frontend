import { UnitId } from "@/lib/game/config";

/**
 * Minimal line icons for troops, in the same outline style as the navbar
 * icons. One stroke color (currentColor), 24×24 grid.
 */

/** Head, body and legs of a soldier standing at x = 10. */
const Body = () => (
  <>
    <circle cx="10" cy="5" r="2" />
    <path d="M10 7.5V15M10 15l-2.5 6M10 15l2.5 6" />
  </>
);

/** A horse facing right, with its rider's body at x = 10. */
const Horse = () => (
  <>
    <path d="M5 13.5h9l3-4.5 3 1.2-1.4 1.6-.8 3.7c0 1.4-.8 2-2 2H6.2C4.8 17.5 4 16.6 4 15.3z" />
    <path d="M6.5 17.5V21M9.5 17.5V21M14 17.5V21M17 17.5V21M4.6 14C3 14.4 2.6 16 3 17.5" />
    <circle cx="10" cy="5" r="1.8" />
    <path d="M10 7v6.5" />
  </>
);

const ICONS: Record<UnitId, JSX.Element> = {
  spearman: (
    <>
      <Body />
      <path d="M10 10l5.5-1M15.5 2v20M14.3 4.2L15.5 1.5l1.2 2.7" />
      <circle cx="6" cy="11.5" r="3" />
    </>
  ),
  swordsman: (
    <>
      <Body />
      <path d="M12 9.6l2.4-.8M14.4 8.8L19 3M13.4 7.6l2 2.4" />
      <path d="M3.5 9h5v3c0 2.4-1.2 4-2.5 5-1.3-1-2.5-2.6-2.5-5z" />
    </>
  ),
  archer: (
    <>
      <Body />
      <path d="M16 3c3.5 3 3.5 15 0 18M16 3v18M10 10.5h6M10 10.5l-2.5 2" />
    </>
  ),
  axeman: (
    <>
      <Body />
      <path d="M10 10.5l4.6-1.6M14 21L16.6 3M16.4 4.4c2.8-.6 4.6 1 4.6 3.6-2 .6-3.6.2-5-.8" />
    </>
  ),
  cavalry: (
    <>
      <Horse />
      <path d="M10 10l3-1M6 11.5L21.5 4" />
    </>
  ),
  paladin: (
    <>
      <Horse />
      <path d="M5 6.5h4.5V9c0 1.8-1 3-2.25 3.8C6 12 5 10.8 5 9z" />
      <path d="M10 9.5l3.5-2.5M13.5 7l1-3" />
    </>
  ),
  knight: (
    <>
      <Horse />
      <path d="M8.4 3.5h3.2M10 3.2V1.2l1.8.8" />
      <path d="M4 11L22.5 7M18 8l2.6 1.4" />
    </>
  ),
  ram: (
    <>
      <path d="M4 10.5L11 5l7 5.5M7 8.2v3.8M15 8.2v3.8" />
      <rect height="3" rx="1.5" width="15" x="3" y="12" />
      <path d="M18 12l3.5 1.5-3.5 1.5M5 15v2.6M16 15v2.6" />
      <circle cx="7" cy="19.5" r="1.8" />
      <circle cx="15" cy="19.5" r="1.8" />
    </>
  ),
  catapult: (
    <>
      <path d="M3 17h18M9 17l3-6.5 3 6.5M14 13.8L5.6 5.6" />
      <circle cx="4.4" cy="4.4" r="1.9" />
      <circle cx="6.5" cy="19.5" r="1.8" />
      <circle cx="17.5" cy="19.5" r="1.8" />
    </>
  ),
};

export const UnitIcon = ({ unit, size = 20, className }: { unit: UnitId; size?: number; className?: string }) => (
  <svg
    aria-label={unit}
    className={className}
    fill="none"
    height={size}
    role="img"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.6}
    viewBox="0 0 24 24"
    width={size}
  >
    {ICONS[unit]}
  </svg>
);
