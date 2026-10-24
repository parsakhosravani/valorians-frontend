"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

import { useGame } from "@/context";
import { BUILDINGS, BuildingDef, RESOURCE_IDS } from "@/lib/game/config";
import { BuildingArt } from "@/art";
import { LevelShield } from "@/components/ui";
import { buildingUpgradeInfo, getRates } from "@/lib/game/engine";
import { formatDuration } from "@/lib/format";

// ─── Layout ──────────────────────────────────────────────────────────────────
//
// An 11×11 isometric stretch of land seen from above, Stronghold style: a
// walled castle in the middle (cells 3–7), farms and workshops outside, forest
// all around. Grid coordinates (c, r): c runs to the lower right, r to the
// lower left. Whole numbers are tile corners; tile (c, r) spans c..c+1, r..r+1.

const N = 11;
const TW = 100; // tile width on screen
const TH = 50; // tile height on screen
const PAD_X = 60;
const TOP = 140; // room above the back corner for tall art
const BOARD_W = N * TW + PAD_X * 2;
const BOARD_H = TOP + N * TH + 70;
const OX = BOARD_W / 2;
const OY = TOP;

/** The castle walls run along these grid lines. */
const W0 = 3;
const W1 = 8;

/** Screen point of a grid position, optionally raised by h pixels. */
const P = (c: number, r: number, h = 0) => ({ x: OX + (c - r) * (TW / 2), y: OY + (c + r) * (TH / 2) - h });
const pts = (...list: { x: number; y: number }[]) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

/** Deterministic noise so the land looks the same every time. */
const noise = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;

  return s - Math.floor(s);
};

const inside = (c: number, r: number) => c >= W0 && c < W1 && r >= W0 && r < W1;

type Raised = "forest" | "grove" | "rocks" | "well" | "dummies" | "hay" | "stall" | "fire" | "sheep";
type Flat = "wheat" | "crops" | "pond" | "clay";

type Cell = {
  col: number;
  row: number;
  building?: string;
  span?: 2;
  /** Sits on a tile corner (the gate and the corner tower), not a tile centre. */
  corner?: boolean;
  raised?: Raised;
  flat?: Flat;
};

const CELLS: Cell[] = [
  // Inside the walls
  { col: 3, row: 3, building: "exploration-center" },
  { col: 4, row: 3, building: "war-hall" },
  { col: 5, row: 3, building: "military-command" },
  { col: 6, row: 3, building: "academy" },
  { col: 7, row: 3, building: "embassy" },
  { col: 3, row: 4, building: "arsenal" },
  { col: 4, row: 4, building: "town-hall", span: 2 },
  { col: 6, row: 4, building: "treasury" },
  { col: 7, row: 4, building: "hospital" },
  { col: 3, row: 5, building: "armory" },
  { col: 6, row: 5, raised: "dummies" },
  { col: 7, row: 5, building: "stable" },
  { col: 3, row: 6, building: "barracks" },
  { col: 4, row: 6, raised: "hay" },
  { col: 5, row: 6, raised: "well" },
  { col: 7, row: 6, building: "trapmaker" },
  { col: 3, row: 7, building: "hideout" },
  { col: 4, row: 7, raised: "stall" },
  { col: 5, row: 7, raised: "fire" },
  { col: 6, row: 7, building: "siege-workshop" },
  // On the walls
  { col: W1, row: W1, building: "city-gate", corner: true },
  { col: W0, row: W1, building: "watchtower", corner: true },
  // Farms along the left road
  { col: 0, row: 10, flat: "crops" },
  { col: 1, row: 10, flat: "wheat" },
  { col: 2, row: 10, building: "windmill" },
  { col: 3, row: 10, flat: "wheat" },
  { col: 4, row: 10, building: "fertilizer-workshop" },
  { col: 5, row: 10, flat: "crops" },
  { col: 6, row: 10, building: "resource-warehouse" },
  { col: 8, row: 10, building: "trading-post" },
  { col: 9, row: 10, raised: "sheep" },
  { col: 0, row: 8, flat: "wheat" },
  { col: 1, row: 8, flat: "wheat" },
  { col: 0, row: 7, flat: "crops" },
  { col: 1, row: 6, flat: "pond" },
  { col: 0, row: 5, flat: "wheat" },
  { col: 1, row: 5, flat: "crops" },
  // Industry along the right road
  { col: 10, row: 0, raised: "forest" },
  { col: 10, row: 1, building: "sawmill" },
  { col: 10, row: 2, raised: "forest" },
  { col: 10, row: 3, raised: "rocks" },
  { col: 10, row: 4, building: "iron-mine" },
  { col: 10, row: 5, raised: "rocks" },
  { col: 10, row: 6, building: "brickyard" },
  { col: 10, row: 7, flat: "clay" },
  { col: 10, row: 8, raised: "grove" },
  { col: 8, row: 0, raised: "forest" },
  { col: 8, row: 1, raised: "grove" },
  { col: 7, row: 0, raised: "forest" },
];

// Fill the rest of the back with woods and the odd thicket.
for (let c = 0; c < N; c++) {
  for (let r = 0; r < N; r++) {
    if (CELLS.some((x) => x.col === c && x.row === r)) continue;
    const back = r < 2 || c < 2;

    if (back && noise(c, r) > 0.35) CELLS.push({ col: c, row: r, raised: noise(r, c) > 0.5 ? "forest" : "grove" });
  }
}

/** Screen position where a cell's art stands, and its draw order. */
const anchor = (c: Cell) => {
  if (c.corner) return { ...P(c.col, c.row), z: (c.col + c.row) * 10 + 9 };
  const k = c.span ?? 1;

  return { ...P(c.col + k / 2, c.row + k / 2), z: (c.col + c.row + k) * 10 + 5 };
};

// ─── The walls ───────────────────────────────────────────────────────────────

type Tier = "planned" | "palisade" | "stone" | "fortress";

/** The City Gate's level decides what the walls are made of. */
const wallTier = (gate: number): Tier => (gate <= 0 ? "planned" : gate < 5 ? "palisade" : gate < 12 ? "stone" : "fortress");
const WALL_H: Record<Tier, number> = { planned: 0, palisade: 24, stone: 30, fortress: 38 };
const THICK = 0.16;

/** One tile-long wall piece along a grid line. Its visible face points down-left (row line) or down-right (col line). */
const WallSegment = ({ line, axis, from, tier }: { line: number; axis: "row" | "col"; from: number; tier: Tier }) => {
  const H = WALL_H[tier];
  // Map (along, across, height) to the screen.
  const q = (a: number, x: number, h = 0) => (axis === "row" ? P(a, x, h) : P(x, a, h));
  const a0 = from;
  const a1 = from + 1;
  const face = axis === "row" ? "#BCB09A" : "#978B76";
  const top = "#DDD3C0";
  const z = (from + line) * 10 + 8;
  const svg = (children: React.ReactNode) => (
    <svg
      aria-hidden="true"
      className="dio-ink absolute left-0 top-0 pointer-events-none"
      height={BOARD_H}
      overflow="visible"
      style={{ zIndex: z }}
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      width={BOARD_W}
    >
      {children}
    </svg>
  );

  if (tier === "palisade") {
    const logs = 7;

    return svg(
      <g stroke="#2B1F15" strokeLinejoin="round" strokeWidth="0.8">
        {Array.from({ length: logs }, (_, i) => {
          const s = a0 + i / logs;
          const e = s + 1 / logs;
          const m = (s + e) / 2;
          const h = H - 2 + noise(i, from + line) * 4;

          return (
            <polygon
              key={i}
              fill={i % 2 ? "#A87A47" : axis === "row" ? "#A87A47" : "#835C33"}
              points={pts(q(s, line), q(e, line), q(e, line, h), q(m, line, h + 6), q(s, line, h))}
            />
          );
        })}
        <polyline fill="none" points={pts(q(a0, line, 7), q(a1, line, 7))} stroke="#6C4B30" strokeWidth="2" />
      </g>
    );
  }

  const courses = Math.floor(H / 7);
  const merlons = 5;

  return svg(
    <g>
      {/* Walkway on top, then the face */}
      <polygon fill={top} points={pts(q(a0, line - THICK, H), q(a1, line - THICK, H), q(a1, line, H), q(a0, line, H))} />
      <polygon fill={face} points={pts(q(a0, line), q(a1, line), q(a1, line, H), q(a0, line, H))} />
      <g opacity="0.45" stroke="#7A6E5C" strokeWidth="0.8">
        {Array.from({ length: courses }, (_, k) => (
          <g key={k}>
            <line x1={q(a0, line, (k + 1) * 7).x} x2={q(a1, line, (k + 1) * 7).x} y1={q(a0, line, (k + 1) * 7).y} y2={q(a1, line, (k + 1) * 7).y} />
            {Array.from({ length: 5 }, (_, j) => {
              const a = a0 + (j + (k % 2) * 0.5) / 5;

              return a < a1 ? <line key={j} x1={q(a, line, k * 7).x} x2={q(a, line, (k + 1) * 7).x} y1={q(a, line, k * 7).y} y2={q(a, line, (k + 1) * 7).y} /> : null;
            })}
          </g>
        ))}
      </g>
      {/* Grime at the foot of the wall */}
      <polygon fill="#3A3426" opacity="0.35" points={pts(q(a0, line), q(a1, line), q(a1, line, 5), q(a0, line, 5))} />
      {/* Battlements */}
      {Array.from({ length: merlons }, (_, j) => {
        const s = a0 + (j + 0.15) / merlons;
        const e = s + 0.5 / merlons;
        const mh = tier === "fortress" ? 8 : 6;

        return (
          <g key={j}>
            <polygon fill={top} points={pts(q(s, line - THICK * 0.5, H + mh), q(e, line - THICK * 0.5, H + mh), q(e, line, H + mh), q(s, line, H + mh))} />
            <polygon fill={face} points={pts(q(s, line, H), q(e, line, H), q(e, line, H + mh), q(s, line, H + mh))} />
          </g>
        );
      })}
    </g>
  );
};

/** A corner tower: wood with a pointed roof, or stone with battlements and a banner. */
const Tower = ({ c, r, tier }: { c: number; r: number; tier: Tier }) => {
  const s = tier === "palisade" ? 0.22 : 0.3;
  const H = WALL_H[tier] + (tier === "palisade" ? 22 : 26);
  const z = (c + r) * 10 + 9;
  const front = pts(P(c - s, r + s), P(c + s, r + s), P(c + s, r + s, H), P(c - s, r + s, H));
  const side = pts(P(c + s, r - s), P(c + s, r + s), P(c + s, r + s, H), P(c + s, r - s, H));
  const top = pts(P(c - s, r - s, H), P(c + s, r - s, H), P(c + s, r + s, H), P(c - s, r + s, H));
  const peak = P(c, r, H + 30);
  const flagBase = tier === "palisade" ? peak : P(c, r, H + 6);

  return (
    <svg
      aria-hidden="true"
      className="dio-ink absolute left-0 top-0 pointer-events-none"
      height={BOARD_H}
      overflow="visible"
      style={{ zIndex: z }}
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      width={BOARD_W}
    >
      <ellipse cx={P(c, r).x + 14} cy={P(c, r).y + 6} fill="#1C2410" opacity="0.35" rx="34" ry="12" />
      {tier === "palisade" ? (
        <g stroke="#2B1F15" strokeWidth="0.8">
          <polygon fill="#A87A47" points={front} />
          <polygon fill="#835C33" points={side} />
          <polygon fill="#C99A63" points={pts(P(c - s - 0.06, r + s + 0.06, H), P(c + s + 0.06, r + s + 0.06, H), peak)} />
          <polygon fill="#A87A47" points={pts(P(c + s + 0.06, r - s - 0.06, H), P(c + s + 0.06, r + s + 0.06, H), peak)} />
        </g>
      ) : (
        <g>
          <polygon fill="#BCB09A" points={front} />
          <polygon fill="#978B76" points={side} />
          <polygon fill="#DDD3C0" points={top} />
          <polygon fill="#2A251C" opacity="0.8" points={pts(P(c - 0.04, r + s, H - 18), P(c + 0.04, r + s, H - 18), P(c + 0.04, r + s, H - 8), P(c - 0.04, r + s, H - 8))} />
          {[-s, -s / 3, s / 3].map((o, i) => (
            <g key={i}>
              <polygon fill="#BCB09A" points={pts(P(c + o, r + s, H), P(c + o + s / 3, r + s, H), P(c + o + s / 3, r + s, H + 8), P(c + o, r + s, H + 8))} />
              <polygon fill="#978B76" points={pts(P(c + s, r + o, H), P(c + s, r + o + s / 3, H), P(c + s, r + o + s / 3, H + 8), P(c + s, r + o, H + 8))} />
            </g>
          ))}
        </g>
      )}
      {tier !== "planned" && (
        <g>
          <line stroke="#2B1F15" strokeWidth="1.5" x1={flagBase.x} x2={flagBase.x} y1={flagBase.y} y2={flagBase.y - 22} />
          <path
            className="motion-safe:animate-[pulse_3s_ease-in-out_infinite]"
            d={`M ${flagBase.x} ${flagBase.y - 22} q 8 -3 16 1 q -3 4 0 8 q -8 -3 -16 0 z`}
            fill={tier === "fortress" ? "#F0BE5A" : "#C94B32"}
          />
        </g>
      )}
    </svg>
  );
};

/** Walls and towers around the castle, skipping the pieces the gate and watchtower stand on. */
const Walls = ({ tier }: { tier: Tier }) => {
  if (tier === "planned") return null;
  const segs: { line: number; axis: "row" | "col"; from: number }[] = [];

  for (let a = W0; a < W1; a++) {
    segs.push({ line: W0, axis: "row", from: a }); // back right
    segs.push({ line: W0, axis: "col", from: a }); // back left
    if (a !== W1 - 1) segs.push({ line: W1, axis: "col", from: a }); // front right (gate gap)
    if (a !== W1 - 1 && a !== W0) segs.push({ line: W1, axis: "row", from: a }); // front left (gate + watchtower gaps)
  }

  return (
    <>
      {segs.map((s) => (
        <WallSegment key={`${s.axis}${s.line}-${s.from}`} {...s} tier={tier} />
      ))}
      <Tower c={W0} r={W0} tier={tier} />
      <Tower c={W1} r={W0} tier={tier} />
    </>
  );
};

// ─── The land ────────────────────────────────────────────────────────────────

const tilePoly = (c: number, r: number, inset = 0) =>
  pts(P(c + inset, r + inset), P(c + 1 - inset, r + inset), P(c + 1 - inset, r + 1 - inset), P(c + inset, r + 1 - inset));

const FlatArt = ({ c, r, kind }: { c: number; r: number; kind: Flat }) => {
  if (kind === "pond") {
    const m = P(c + 0.5, r + 0.5);

    return (
      <g>
        <ellipse cx={m.x} cy={m.y} fill="#577734" rx={TW * 0.4} ry={TH * 0.38} />
        <ellipse cx={m.x} cy={m.y} fill="#6FA9C2" rx={TW * 0.34} ry={TH * 0.31} />
        <path d={`M ${m.x - 18} ${m.y - 2} q 8 -4 16 0 M ${m.x + 2} ${m.y + 6} q 8 -4 16 0`} fill="none" opacity="0.5" stroke="#CFE2E0" strokeWidth="1.2" />
      </g>
    );
  }
  if (kind === "clay") {
    return (
      <g>
        <polygon fill="#B9603C" points={tilePoly(c, r, 0.12)} />
        <polygon fill="#D9825C" points={tilePoly(c, r, 0.24)} />
        <polygon fill="#924A2D" points={tilePoly(c, r, 0.4)} />
      </g>
    );
  }
  const rows = 7;
  const gold = kind === "wheat";

  return (
    <g>
      <polygon fill={gold ? "#CFAE45" : "#6F9543"} points={tilePoly(c, r, 0.05)} />
      {Array.from({ length: rows }, (_, i) => {
        const t = 0.1 + (i / (rows - 1)) * 0.8;
        const a = P(c + 0.08, r + t);
        const b = P(c + 0.92, r + t);

        return <line key={i} stroke={gold ? "#E9CC62" : "#9CC66A"} strokeLinecap="round" strokeWidth="3.2" x1={a.x} x2={b.x} y1={a.y} y2={b.y} />;
      })}
    </g>
  );
};

type Road = { x: number; y: number }[];

const ROADS: { path: Road; inner?: boolean }[] = [
  { path: [P(N + 0.6, N + 0.6), P(W1, W1)] }, // out of the gate to the edge of the map
  { path: [P(9.5, 9.5), P(-0.6, 9.5)] }, // farms
  { path: [P(9.5, 9.5), P(9.5, -0.6)] }, // workshops
  { path: [P(W1, W1), P(6, 6)], inner: true }, // up to the keep
];

const roadD = (p: Road) => p.map((q, i) => `${i ? "L" : "M"} ${q.x} ${q.y}`).join(" ");

const Ground = ({ tier, selected }: { tier: Tier; selected?: Cell }) => {
  const T = P(0, 0);
  const R = P(N, 0);
  const B = P(N, N);
  const L = P(0, N);
  const ring = (o: number) =>
    // The ditch/moat: the castle square grown by o, minus the square itself.
    `M ${pts(P(W0 - o, W0 - o), P(W1 + o, W0 - o), P(W1 + o, W1 + o), P(W0 - o, W1 + o)).replace(/ /g, " L ")} Z ` +
    `M ${pts(P(W0, W0), P(W0, W1), P(W1, W1), P(W1, W0)).replace(/ /g, " L ")} Z`;

  return (
    <svg aria-hidden="true" className="absolute inset-0" height={BOARD_H} viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} width={BOARD_W}>
      <defs>
        <pattern height="46" id="dio-wood" patternUnits="userSpaceOnUse" width="54">
          <rect fill="#2C5430" height="46" width="54" />
          <circle cx="12" cy="12" fill="#3A6B3C" r="13" />
          <circle cx="40" cy="20" fill="#346238" r="15" />
          <circle cx="24" cy="38" fill="#41763F" r="12" />
          <circle cx="8" cy="10" fill="#4F8A4A" r="5" />
          <circle cx="36" cy="16" fill="#4F8A4A" r="5" />
        </pattern>
        <radialGradient id="dio-sun" cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#FFE9B0" stopOpacity="0.16" />
          <stop offset="1" stopColor="#FFE9B0" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Woods all around */}
      <rect fill="url(#dio-wood)" height={BOARD_H} width={BOARD_W} />

      {/* Meadow and the packed earth of the bailey */}
      {Array.from({ length: N * N }, (_, k) => {
        const c = k % N;
        const r = Math.floor(k / N);
        const n = noise(c, r);
        const fill = inside(c, r)
          ? ["#CFAF7B", "#D4B47F", "#C9A975"][Math.floor(n * 3)]
          : ["#8AB055", "#90B65A", "#86AC52", "#95BA5E"][Math.floor(n * 4)];

        return <polygon key={k} fill={fill} points={tilePoly(c, r, -0.01)} />;
      })}
      {/* Soft edge where the meadow meets the woods */}
      <polygon fill="none" opacity="0.7" points={pts(T, R, B, L)} stroke="#3A6B3C" strokeLinejoin="round" strokeWidth="22" />

      {/* Bare patches and tufts */}
      {Array.from({ length: 70 }, (_, i) => {
        const c = noise(i, 7) * N;
        const r = noise(7, i) * N;
        const p = P(c, r);
        const inBailey = c > W0 && c < W1 && r > W0 && r < W1;

        return noise(i, i) > 0.5 ? (
          <ellipse key={i} cx={p.x} cy={p.y} fill={inBailey ? "#E0C590" : "#A7BF6A"} opacity="0.35" rx={10 + noise(i, 3) * 16} ry={5 + noise(i, 4) * 6} />
        ) : (
          <path
            key={i}
            d={`M ${p.x - 3} ${p.y} l 2 -5 M ${p.x} ${p.y} l 0 -6 M ${p.x + 3} ${p.y} l -1 -5`}
            opacity="0.6"
            stroke={inBailey ? "#9C8256" : "#5F8A3A"}
            strokeLinecap="round"
            strokeWidth="1.3"
          />
        );
      })}

      {/* Ditch or moat outside the walls */}
      {tier === "palisade" && <path d={ring(0.28)} fill="#8E7146" fillRule="evenodd" opacity="0.75" />}
      {(tier === "stone" || tier === "fortress") && (
        <g>
          <path d={ring(0.36)} fill="#8E7146" fillRule="evenodd" />
          <path d={ring(0.3)} fill="#4F879F" fillRule="evenodd" />
          <path d={ring(0.3)} fill="none" opacity="0.35" stroke="#CFE2E0" strokeDasharray="6 14" strokeWidth="1.2" />
          {/* Bridge at the gate */}
          <polygon fill="#A87A47" points={pts(P(W1 - 0.05, W1 - 0.2), P(W1 + 0.45, W1 + 0.3), P(W1 + 0.3, W1 + 0.45), P(W1 - 0.2, W1 - 0.05))} />
        </g>
      )}
      {tier === "planned" && (
        <g opacity="0.8">
          <polygon fill="none" points={pts(P(W0, W0), P(W1, W0), P(W1, W1), P(W0, W1))} stroke="#F7EEDC" strokeDasharray="8 8" strokeWidth="2" />
          {[P(W0, W0), P(W1, W0), P(W0, W1), P(W1, W1)].map((p, i) => (
            <rect key={i} fill="#6B4A2B" height="14" width="4" x={p.x - 2} y={p.y - 12} />
          ))}
        </g>
      )}

      {/* Roads with wheel ruts */}
      {ROADS.map((rd, i) => (
        <g key={i} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={roadD(rd.path)} opacity="0.55" stroke="#8E7146" strokeWidth={rd.inner ? 20 : 24} />
          <path d={roadD(rd.path)} stroke={rd.inner ? "#E3CBA0" : "#D9BC88"} strokeWidth={rd.inner ? 15 : 18} />
          <path d={roadD(rd.path)} opacity="0.35" stroke="#8E7146" strokeDasharray="14 10" strokeWidth="9" />
          <path d={roadD(rd.path)} stroke={rd.inner ? "#E3CBA0" : "#D9BC88"} strokeWidth="5" />
        </g>
      ))}

      {/* Fields, ponds and pits */}
      {CELLS.filter((x) => x.flat).map((x) => (
        <FlatArt key={`${x.col},${x.row}`} c={x.col} kind={x.flat!} r={x.row} />
      ))}

      {/* Foundations under buildings */}
      {CELLS.filter((x) => x.building && !x.corner).map((x) => {
        const k = x.span ?? 1;

        return (
          <polygon
            key={x.building}
            fill="#5E4B33"
            opacity="0.4"
            points={pts(P(x.col + 0.1, x.row + 0.1), P(x.col + k - 0.1, x.row + 0.1), P(x.col + k - 0.1, x.row + k - 0.1), P(x.col + 0.1, x.row + k - 0.1))}
          />
        );
      })}

      {selected && (
        <polygon
          className="animate-pulse"
          fill="#F7D58A"
          fillOpacity="0.18"
          points={
            selected.corner
              ? pts(P(selected.col - 0.6, selected.row - 0.6), P(selected.col + 0.6, selected.row - 0.6), P(selected.col + 0.6, selected.row + 0.6), P(selected.col - 0.6, selected.row + 0.6))
              : pts(
                  P(selected.col, selected.row),
                  P(selected.col + (selected.span ?? 1), selected.row),
                  P(selected.col + (selected.span ?? 1), selected.row + (selected.span ?? 1)),
                  P(selected.col, selected.row + (selected.span ?? 1))
                )
          }
          stroke="#F7D58A"
          strokeWidth="3"
        />
      )}

      <rect fill="url(#dio-sun)" height={BOARD_H} width={BOARD_W} />
    </svg>
  );
};

// ─── People on the roads ─────────────────────────────────────────────────────

const WALKERS = [
  { path: ROADS[0].path, dur: 34, delay: 0, coat: "#5B6E8C" },
  { path: ROADS[0].path, dur: 41, delay: -18, coat: "#8C5B3A" },
  { path: ROADS[1].path, dur: 46, delay: -6, coat: "#7A7F3E" },
  { path: ROADS[1].path, dur: 52, delay: -30, coat: "#C94B32" },
  { path: ROADS[2].path, dur: 44, delay: -12, coat: "#6A5A8C" },
  { path: ROADS[2].path, dur: 50, delay: -35, coat: "#5B6E8C" },
  { path: ROADS[3].path, dur: 18, delay: -4, coat: "#C94B32" },
];

const Walkers = () => {
  const [still, setStill] = useState(true);

  useEffect(() => setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  if (still) return null;

  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      height={BOARD_H}
      style={{ zIndex: 2 }}
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      width={BOARD_W}
    >
      {WALKERS.map((w, i) => {
        const there = w.path.map((q, j) => `${j ? "L" : "M"} ${q.x} ${q.y}`).join(" ");
        const back = [...w.path]
          .reverse()
          .slice(1)
          .map((q) => `L ${q.x} ${q.y}`)
          .join(" ");

        return (
          <g key={i}>
            <animateMotion begin={`${w.delay}s`} dur={`${w.dur}s`} path={`${there} ${back}`} repeatCount="indefinite" />
            <ellipse cx="1.5" cy="0.5" fill="#1C2410" opacity="0.35" rx="4.5" ry="1.8" />
            <rect fill={w.coat} height="7" rx="1.5" width="5" x="-2.5" y="-8" />
            <circle cx="0" cy="-10" fill="#E2BE96" r="2.3" />
          </g>
        );
      })}
      {/* An ox cart heading for the farms */}
      <g>
        <animateMotion
          begin="-10s"
          dur="70s"
          path={`${roadD([P(N + 0.6, N + 0.6), P(9.5, 9.5), P(1, 9.5)])} ${roadD([P(1, 9.5), P(9.5, 9.5), P(N + 0.6, N + 0.6)]).replace("M", "L")}`}
          repeatCount="indefinite"
        />
        <ellipse cx="2" cy="1" fill="#1C2410" opacity="0.35" rx="13" ry="3.5" />
        <rect fill="#A87A47" height="7" rx="1" width="12" x="-12" y="-9" />
        <rect fill="#E9CC62" height="4" rx="2" width="10" x="-11" y="-12" />
        <circle cx="-6" cy="-2" fill="#2B1F15" r="2.6" />
        <rect fill="#6A4A33" height="6" rx="2.5" width="9" x="2" y="-8" />
        <circle cx="11" cy="-7" fill="#6C4B30" r="2.4" />
      </g>
    </svg>
  );
};

// ─── Trees, rocks and yard clutter ───────────────────────────────────────────

const Pine = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx="9" cy="3" fill="#1C2410" opacity="0.4" rx="15" ry="5" />
    <rect fill="#6C4B30" height="9" width="4" x="-2" y="-8" />
    {[0, 1, 2].map((i) => (
      <g key={i} transform={`translate(0 ${-12 - i * 11}) scale(${1 - i * 0.22})`}>
        <polygon fill="#3F7340" points="0,-22 -14,4 14,4" />
        <polygon fill="#2E5932" points="0,-22 14,4 0,4" />
      </g>
    ))}
  </g>
);

const Oak = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx="10" cy="3" fill="#1C2410" opacity="0.4" rx="18" ry="6" />
    <rect fill="#6C4B30" height="14" width="5" x="-2.5" y="-12" />
    <circle cx="-7" cy="-20" fill="#6FA04A" r="11" />
    <circle cx="7" cy="-22" fill="#4F7F36" r="12" />
    <circle cx="0" cy="-31" fill="#7FB052" r="11" />
    <circle cx="-4" cy="-30" fill="#9CC66A" r="5" />
  </g>
);

const RaisedArt = ({ kind, seed }: { kind: Raised; seed: number }) => {
  const w = TW;
  const h = 110;
  const j = (k: number) => (noise(seed, k) - 0.5) * 10;

  return (
    <svg aria-hidden="true" className="dio-ink" height={h} overflow="visible" viewBox={`${-w / 2} ${-h + TH / 2} ${w} ${h}`} width={w}>
      {kind === "forest" && (
        <>
          <Pine s={1.05} x={-22 + j(1)} y={-6} />
          <Oak s={0.9} x={18 + j(2)} y={-10} />
          <Pine s={0.9} x={4 + j(3)} y={-16} />
          <Pine s={1.1} x={-4 + j(4)} y={10} />
          <Oak s={0.8} x={26 + j(5)} y={8} />
        </>
      )}
      {kind === "grove" && (
        <>
          <Oak s={1} x={-14 + j(1)} y={-2} />
          <Oak s={0.8} x={18 + j(2)} y={6} />
        </>
      )}
      {kind === "rocks" && (
        <g>
          <ellipse cx="8" cy="10" fill="#1C2410" opacity="0.35" rx="34" ry="10" />
          <polygon fill="#B3ADA3" points="-28,8 -20,-14 -4,-20 6,4" />
          <polygon fill="#8F897F" points="-4,-20 6,4 -6,10" />
          <polygon fill="#C2BCB2" points="4,12 12,-6 26,-2 30,12" />
          <polygon fill="#6E6962" points="26,-2 30,12 20,14" />
          <polygon fill="#A39D93" points="-14,16 -10,6 0,8 0,18" />
        </g>
      )}
      {kind === "well" && (
        <g>
          <ellipse cx="6" cy="6" fill="#2A2015" opacity="0.35" rx="20" ry="7" />
          <ellipse cx="0" cy="0" fill="#978B76" rx="14" ry="7" />
          <rect fill="#978B76" height="10" width="28" x="-14" y="-10" />
          <ellipse cx="0" cy="-10" fill="#BCB09A" rx="14" ry="7" />
          <ellipse cx="0" cy="-10" fill="#4F879F" rx="9" ry="4.5" />
          <rect fill="#6C4B30" height="26" width="3" x="-13" y="-34" />
          <rect fill="#6C4B30" height="26" width="3" x="10" y="-34" />
          <polygon fill="#A87A47" points="-17,-32 17,-32 10,-42 -10,-42" />
        </g>
      )}
      {kind === "dummies" && (
        <g stroke="#2B1F15" strokeWidth="0.8">
          {[
            [-18, -2],
            [4, 6],
            [22, -4],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <ellipse cx="4" cy="2" fill="#2A2015" opacity="0.35" rx="7" ry="2.5" stroke="none" />
              <rect fill="#835C33" height="22" width="2.5" x="-1.25" y="-20" />
              <rect fill="#E0BE7A" height="8" rx="3" width="9" x="-4.5" y="-18" />
              <rect fill="#835C33" height="2.5" width="16" x="-8" y="-16" />
              <circle cx="0" cy="-22" fill="#E0BE7A" r="3.5" />
            </g>
          ))}
        </g>
      )}
      {kind === "hay" && (
        <g>
          <ellipse cx="6" cy="8" fill="#2A2015" opacity="0.35" rx="30" ry="9" />
          <path d="M -24 6 Q -24 -20 -6 -24 Q 10 -20 10 6 Z" fill="#F0D27A" />
          <path d="M -6 -24 Q 10 -20 10 6 L 0 6 Q 2 -14 -6 -24 Z" fill="#D9B556" />
          <path d="M 8 10 Q 8 -8 19 -10 Q 30 -8 30 10 Z" fill="#E6C66A" />
        </g>
      )}
      {kind === "stall" && (
        <g stroke="#2B1F15" strokeWidth="0.8">
          <ellipse cx="6" cy="8" fill="#2A2015" opacity="0.35" rx="26" ry="8" stroke="none" />
          <rect fill="#A87A47" height="10" width="34" x="-17" y="-6" />
          <rect fill="#6C4B30" height="20" width="2" x="-17" y="-26" />
          <rect fill="#6C4B30" height="20" width="2" x="15" y="-26" />
          <path d="M -21 -24 L 21 -24 L 17 -34 L -17 -34 Z" fill="#C94B32" />
          <path d="M -21 -24 L -14 -24 L -11 -34 L -17 -34 Z M -7 -24 L 0 -24 L 0 -34 L -6 -34 Z M 7 -24 L 14 -24 L 11 -34 L 6 -34 Z" fill="#F7EEDC" />
          <circle cx="-9" cy="-8" fill="#E9CC62" r="3" stroke="none" />
          <circle cx="-2" cy="-8" fill="#C94B32" r="3" stroke="none" />
          <circle cx="6" cy="-8" fill="#9CC66A" r="3" stroke="none" />
        </g>
      )}
      {kind === "fire" && (
        <g>
          <ellipse cx="0" cy="4" fill="#FF8A3D" opacity="0.22" rx="38" ry="15" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;

            return <ellipse key={i} cx={Math.cos(a) * 15} cy={Math.sin(a) * 6.5} fill="#7E776C" rx="4.5" ry="3" />;
          })}
          <g className="origin-bottom animate-flame" style={{ transformBox: "fill-box" }}>
            <path d="M 0 2 C -11 -6 -7 -19 0 -30 C 7 -19 11 -6 0 2 Z" fill="#E8612C" />
            <path d="M 0 2 C -5 -4 -4 -13 0 -20 C 4 -13 5 -4 0 2 Z" fill="#FFC56B" />
          </g>
        </g>
      )}
      {kind === "sheep" && (
        <g>
          <g fill="none" stroke="#835C33" strokeWidth="2">
            <polygon points={`0,${-TH * 0.36} ${TW * 0.36},0 0,${TH * 0.36} ${-TW * 0.36},0`} />
          </g>
          {[
            [-14, -2],
            [6, -8],
            [12, 6],
            [-4, 8],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <ellipse cx="2" cy="2" fill="#2A2015" opacity="0.3" rx="6" ry="2" />
              <ellipse cx="0" cy="-3" fill="#EDE6D6" rx="6" ry="4" />
              <circle cx={i % 2 ? -5 : 5} cy="-5" fill="#3A2F27" r="2" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
};

// ─── Buildings ───────────────────────────────────────────────────────────────

type Status = { level: number; job?: { toLevel: number; startedAt: number; endsAt: number }; canUpgrade: boolean };

const Bubble = ({ tone, children }: { tone: "good" | "work"; children: React.ReactNode }) => (
  <span
    className={clsx(
      "flex items-center justify-center gap-1 h-7 min-w-7 px-1.5 rounded-full text-[11px] font-black shadow-[0_2px_6px_rgba(0,0,0,0.5)] border-2",
      tone === "good" ? "bg-good text-[#0E0B08] border-[#E6F5D9]" : "bg-ember text-[#FBF6EC] border-[#FFD2B0]"
    )}
  >
    {children}
  </span>
);

/** Where the ground sits inside a piece of building art (fraction of its height). */
const ART_FOOT = 98 / 128;

const sizeFor = (cell: Cell) =>
  cell.span === 2 ? TW * 2.15 : cell.building === "city-gate" ? TW * 1.5 : cell.corner ? TW * 1.2 : TW * 1.1;

const BuildingOnPlot = ({
  b,
  cell,
  st,
  now,
  interactive,
  onOpen,
}: {
  b: BuildingDef;
  cell: Cell;
  st: Status;
  now: number;
  interactive: boolean;
  onOpen?: () => void;
}) => {
  const at = anchor(cell);
  const size = sizeFor(cell);
  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      aria-label={interactive ? `${b.name}, level ${st.level}` : undefined}
      className={clsx("absolute", interactive && "group")}
      style={{ left: at.x - size / 2, top: at.y - size * ART_FOOT, width: size, height: size, zIndex: at.z }}
      onClick={interactive ? onOpen : undefined}
    >
      <BuildingArt
        className={clsx("w-full h-full drop-shadow-[5px_6px_4px_rgba(20,30,10,0.35)] transition-transform", interactive && "group-active:scale-95")}
        id={b.id}
        level={st.job && st.level === 0 ? 1 : st.level}
      />
      {/* Level shield */}
      {st.level > 0 && <LevelShield className="absolute left-[12%] bottom-[10%]" level={st.level} />}

      {/* Status bubble above the roof */}
      {interactive && (st.job || st.canUpgrade) && (
        <span className="absolute left-1/2 -translate-x-1/2 top-[2%] animate-float">
          {st.job ? (
            <Bubble tone="work">
              <svg aria-hidden="true" fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" viewBox="0 0 24 24" width="13">
                <path d="m15 12-8.5 8.5a2.1 2.1 0 1 1-3-3L12 9M17.6 6.4 20 4M14 4l6 6-4 4-6-6z" />
              </svg>
              {formatDuration(st.job.endsAt - now)}
            </Bubble>
          ) : (
            <Bubble tone="good">
              <svg aria-hidden="true" fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 24 24" width="13">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </Bubble>
          )}
        </span>
      )}
    </Tag>
  );
};

// ─── Board (shared by Build and the Hall banner) ─────────────────────────────

const useStatuses = () => {
  const { state } = useGame();

  return useMemo(() => {
    const free = state.queue.length < getRates(state).builders;
    const out: Record<string, Status> = {};

    for (const b of BUILDINGS) {
      const level = state.buildings[b.id] ?? 0;
      const job = state.queue.find((q) => q.building === b.id);
      const info = buildingUpgradeInfo(state, b.id);

      out[b.id] = {
        level,
        job,
        canUpgrade:
          level > 0 && !job && !info.maxed && free && RESOURCE_IDS.every((r) => state.resources[r] >= info.cost),
      };
    }

    return out;
  }, [state]);
};

const Board = ({
  interactive,
  selectedId,
  onOpen,
}: {
  interactive: boolean;
  selectedId?: string;
  onOpen?: (b: BuildingDef) => void;
}) => {
  const { now, state } = useGame();
  const statuses = useStatuses();
  const selected = CELLS.find((c) => c.building === selectedId);
  const tier = wallTier(state.buildings["city-gate"] ?? 0);

  return (
    <div className="relative" style={{ width: BOARD_W, height: BOARD_H }}>
      <Ground selected={selected} tier={tier} />
      <Walkers />
      <Walls tier={tier} />
      {CELLS.map((c) => {
        const at = anchor(c);

        if (c.flat) return null;
        if (c.raised) {
          return (
            <div
              key={`${c.col},${c.row}`}
              className="absolute pointer-events-none"
              style={{ left: at.x - TW / 2, top: at.y - 110 + TH / 2, zIndex: at.z - 1 }}
            >
              <RaisedArt kind={c.raised} seed={c.col * 31 + c.row} />
            </div>
          );
        }
        const b = BUILDINGS.find((x) => x.id === c.building);

        if (!b) return null;

        return (
          <BuildingOnPlot
            key={b.id}
            b={b}
            cell={c}
            interactive={interactive}
            now={now}
            st={statuses[b.id]}
            onOpen={() => onOpen?.(b)}
          />
        );
      })}
    </div>
  );
};

/** Dark woods beyond the edge of the map, so the land never ends in a hard line. */
const Woods = () => (
  <div aria-hidden="true" className="absolute inset-0 bg-[#2C5430]">
    <svg className="absolute inset-0 w-full h-full">
      <defs>
        <pattern height="46" id="dio-woods-bg" patternUnits="userSpaceOnUse" width="54">
          <circle cx="12" cy="12" fill="#3A6B3C" r="13" />
          <circle cx="40" cy="20" fill="#346238" r="15" />
          <circle cx="24" cy="38" fill="#41763F" r="12" />
        </pattern>
      </defs>
      <rect fill="url(#dio-woods-bg)" height="100%" width="100%" />
    </svg>
  </div>
);

const Vignette = () => (
  <div
    aria-hidden="true"
    className="absolute inset-0 pointer-events-none z-[5] bg-[radial-gradient(ellipse_at_50%_45%,transparent_55%,rgba(12,9,5,0.55)_100%)]"
  />
);

// ─── Public components ───────────────────────────────────────────────────────

/** A still picture of the player's castle, cropped to the walls (for the Hall banner). */
export const CastlePreview = ({ height }: { height: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(390);

  useEffect(() => {
    const el = ref.current;

    if (!el) return;
    const fit = () => setWidth(el.clientWidth);

    fit();
    const ro = new ResizeObserver(fit);

    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  // Fit the walls plus a little land on each side.
  const left = P(W0 - 0.8, W1 + 0.8).x;
  const right = P(W1 + 0.8, W0 - 0.8).x;
  const s = width / (right - left);
  const focus = P((W0 + W1) / 2, (W0 + W1) / 2);

  return (
    <div ref={ref} className="relative w-full overflow-hidden" style={{ height }}>
      <Woods />
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: BOARD_W,
          height: BOARD_H,
          transform: `translate(${width / 2 - focus.x * s}px, ${height * 0.55 - focus.y * s}px) scale(${s})`,
        }}
      >
        <Board interactive={false} />
      </div>
      <Vignette />
    </div>
  );
};

const ZOOMS = [0.4, 0.55, 0.7, 0.85, 1, 1.2];
/** Margin of woods around the map inside the scroll area. */
const MX = 40;
const MY = 30;
const START_ZOOM = 0.85;

/** The Build screen's castle: pan, pinch or +/− to zoom, tap a building. */
export const Diorama = ({ onOpen, selectedId }: { onOpen: (b: BuildingDef) => void; selectedId?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(START_ZOOM);
  const zoomRef = useRef(zoom);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);

  zoomRef.current = zoom;

  const zoomTo = (next: number, focus?: { x: number; y: number }) => {
    const el = ref.current;
    const z = Math.max(ZOOMS[0], Math.min(ZOOMS[ZOOMS.length - 1], next));

    if (!el || z === zoomRef.current) return;
    const fx = focus?.x ?? el.clientWidth / 2;
    const fy = focus?.y ?? el.clientHeight / 2;
    const bx = (el.scrollLeft + fx - MX) / zoomRef.current;
    const by = (el.scrollTop + fy - MY) / zoomRef.current;

    zoomRef.current = z;
    setZoom(z);
    requestAnimationFrame(() => {
      el.scrollLeft = bx * z + MX - fx;
      el.scrollTop = by * z + MY - fy;
    });
  };

  // Start centred on the keep.
  useEffect(() => {
    const el = ref.current;

    if (!el) return;
    const keep = P(5.5, 5.5);

    zoomRef.current = START_ZOOM;
    setZoom(START_ZOOM);
    requestAnimationFrame(() => {
      el.scrollLeft = keep.x * START_ZOOM + MX - el.clientWidth / 2;
      el.scrollTop = (keep.y - 20) * START_ZOOM + MY - el.clientHeight / 2;
    });
  }, []);

  // Two-finger pinch zoom.
  useEffect(() => {
    const el = ref.current;

    if (!el) return;
    let start: { d: number; z: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) start = { d: dist(e.touches), z: zoomRef.current };
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const focus = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      };

      zoomTo(start.z * (dist(e.touches) / start.d), focus);
    };
    const onEnd = () => (start = null);

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []);

  // Mouse: drag to pan, wheel to zoom.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !ref.current) return;
    drag.current = { x: e.clientX, y: e.clientY, left: ref.current.scrollLeft, top: ref.current.scrollTop, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;

    if (!d || !ref.current) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;

    if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
    ref.current.scrollLeft = d.left - dx;
    ref.current.scrollTop = d.top - dy;
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current?.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
    drag.current = null;
  };

  return (
    <div className="absolute inset-0">
      <Woods />
      <div
        ref={ref}
        className="absolute inset-0 overflow-auto scrollable overscroll-contain select-none cursor-grab active:cursor-grabbing"
        onClickCapture={onClickCapture}
        onPointerDown={onPointerDown}
        onPointerLeave={() => (drag.current = null)}
        onPointerMove={onPointerMove}
        onPointerUp={() => setTimeout(() => (drag.current = null), 0)}
        onWheel={(e) => {
          if (!e.ctrlKey && Math.abs(e.deltaY) < 40) return;
          const rect = ref.current!.getBoundingClientRect();

          zoomTo(zoomRef.current * (e.deltaY > 0 ? 0.9 : 1.1), { x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
      >
        <div style={{ width: BOARD_W * zoom + MX * 2, height: BOARD_H * zoom + MY * 2, padding: `${MY}px ${MX}px` }}>
          <div className="origin-top-left" style={{ width: BOARD_W, height: BOARD_H, transform: `scale(${zoom})` }}>
            <Board interactive selectedId={selectedId} onOpen={onOpen} />
          </div>
        </div>
      </div>
      <Vignette />

      <div className="absolute right-2 bottom-2 flex flex-col gap-1.5 z-10">
        <button
          aria-label="Zoom in"
          className="w-11 h-11 rounded-xl bg-panel/95 border border-line text-xl font-black text-goldtext shadow-lg"
          onClick={() => zoomTo(ZOOMS.find((z) => z > zoom + 0.01) ?? zoom)}
        >
          +
        </button>
        <button
          aria-label="Zoom out"
          className="w-11 h-11 rounded-xl bg-panel/95 border border-line text-xl font-black text-goldtext shadow-lg"
          onClick={() => zoomTo([...ZOOMS].reverse().find((z) => z < zoom - 0.01) ?? zoom)}
        >
          −
        </button>
      </div>
    </div>
  );
};
