"use client";
import clsx from "clsx";

type Pt = { x: number; y: number };

/** How far along its road something is (0 at home, 1 on arrival). */
export const progress = (now: number, sentAt: number, arrivesAt: number) =>
  Math.min(1, Math.max(0, (now - sentAt) / Math.max(1, arrivesAt - sentAt)));

const lerp = (a: Pt, b: Pt, p: number) => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
});

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

/** Crossed swords. */
const Swords = () => (
  <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" viewBox="0 0 24 24" width="14">
    <path d="M4 4l11 11M20 4L9 15" />
    <path d="M13 17l4-4M11 17l-4-4M16 16l4 4M8 16l-4 4" />
  </svg>
);

/** A tied sack of goods. */
export const Sack = () => (
  <svg aria-hidden="true" fill="currentColor" height="14" viewBox="0 0 24 24" width="14">
    <path d="M9 2.5h6l-1.6 3.2h-2.8z" />
    <path d="M10.2 7h3.6c3.9 2.2 6.2 5.8 6.2 9.4 0 3.2-2.6 5.1-8 5.1s-8-1.9-8-5.1C4 12.8 6.3 9.2 10.2 7z" />
  </svg>
);

/** A small round marker on the road. */
const Dot = ({
  ring,
  fill,
  color,
  pulse,
  dim,
  children,
}: {
  ring: string;
  fill: string;
  color: string;
  pulse?: boolean;
  dim?: boolean;
  children: React.ReactNode;
}) => (
  <span className={clsx("relative flex", dim && "opacity-60 scale-90")}>
    {pulse && (
      <span className="absolute inset-0 rounded-full animate-ping" style={{ background: ring, opacity: 0.5 }} />
    )}
    <span
      className="relative w-6 h-6 rounded-full flex items-center justify-center border-2 shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
      style={{ background: fill, borderColor: ring, color }}
    >
      {children}
    </span>
  </span>
);

/** An army on the march. */
export const ArmyToken = ({
  from,
  to,
  p,
  incoming,
}: {
  from: Pt;
  to: Pt;
  p: number;
  incoming: boolean;
}) => (
  <Rider at={lerp(from, to, p)} z={5}>
    <Dot
      color={incoming ? "#FFE3D6" : "#1A120B"}
      fill={incoming ? "#C2432A" : "#E3A948"}
      pulse={incoming}
      ring={incoming ? "#F06A44" : "#1A120B"}
    >
      <Swords />
    </Dot>
  </Rider>
);

/** A merchant carrying a load across the map. */
export const CaravanToken = ({
  from,
  to,
  p,
  kind,
}: {
  from: Pt;
  to: Pt;
  p: number;
  kind: "coming" | "going" | "other";
}) => (
  <Rider at={lerp(from, to, p)} z={kind === "other" ? 3 : 4}>
    <Dot
      color={kind === "coming" ? "#1A120B" : "#3A2A1B"}
      dim={kind === "other"}
      fill={kind === "coming" ? "#9DD07F" : "#E9D3A1"}
      ring="#1A120B"
    >
      <Sack />
    </Dot>
  </Rider>
);
