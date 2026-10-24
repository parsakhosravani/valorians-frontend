/**
 * Interface icons: 24×24, 2px round strokes, currentColor. Pair with
 * GameIcon (src/art/icons.tsx) for resources and stats.
 */
import React from "react";

const PATHS = {
  hall: (
    <>
      <path d="M3 21h18M5 21V10l7-6 7 6v11" />
      <path d="M9 21v-6h6v6M3 11l9-8 9 8" />
    </>
  ),
  build: (
    <>
      <path d="m15 12-8.5 8.5a2.1 2.1 0 1 1-3-3L12 9" />
      <path d="M17.6 6.4 20 4M14 4l6 6-4 4-6-6z" />
    </>
  ),
  war: (
    <>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" />
      <path d="M9.5 17.5 21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4M5 21l-2-2" />
    </>
  ),
  friends: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.4.6 4 2.8 4 6" />
    </>
  ),
  mine: (
    <>
      <path d="M14 4c3 0 6 2 7 5M3 21l9-9M10 4c-3 0-6 2-7 5" />
      <path d="M14 4 10 4l2 8z" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  copy: (
    <>
      <rect height="12" rx="2.5" width="12" x="9" y="9" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </>
  ),
  share: (
    <>
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M5 13v5a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.5" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
  back: <path d="m15 6-6 6 6 6" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4" />
    </>
  ),
  lock: (
    <>
      <rect height="10" rx="2" width="14" x="5" y="11" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  gift: (
    <>
      <rect height="12" rx="1.5" width="18" x="3" y="9" />
      <path d="M3 13h18M12 9v12M12 9c-1.5-3-6-4-6-1s4 1 6 1zM12 9c1.5-3 6-4 6-1s-4 1-6 1z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5c0 3 1.5 4.5 3.5 4.5M16 6h3c0 3-1.5 4.5-3.5 4.5M12 13v4M8 21h8M9 17h6v4H9z" />
    </>
  ),
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
} as const;

export type IconName = keyof typeof PATHS;

export const Icon = ({
  name,
  size = 22,
  className,
  strokeWidth = 2,
  label,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  /** Accessible name; leave empty when the icon sits next to text. */
  label?: string;
}) => (
  <svg
    aria-hidden={label ? undefined : true}
    aria-label={label}
    className={className}
    fill="none"
    height={size}
    role={label ? "img" : undefined}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={strokeWidth}
    viewBox="0 0 24 24"
    width={size}
  >
    {PATHS[name]}
  </svg>
);
