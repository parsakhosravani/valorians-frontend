"use client";
/**
 * Full-screen background landscapes in the same flat style: a sky, two
 * mountain ranges, a tree line and a foreground hill with a building from
 * the kit. Portrait (390×844) and cropped to cover.
 */
import React, { useId } from "react";

import { BUILDING_ART } from "./buildings";
import { Pine } from "./iso";

export type SceneKind = "dusk" | "battle" | "night" | "feast" | "road" | "iron" | "wood" | "clay" | "crop";

type Look = {
  sky: [string, string, string];
  sun: string;
  far: string;
  mid: string;
  trees: string;
  near: string;
  nearTop: string;
  props: { id: string; x: number; y: number; s: number }[];
  moon?: boolean;
};

const LOOKS: Record<SceneKind, Look> = {
  dusk: {
    sky: ["#25304A", "#7E5865", "#E8A066"],
    sun: "#FBD38A",
    far: "#56556E",
    mid: "#3F4A55",
    trees: "#2C3D30",
    near: "#283A28",
    nearTop: "#3D5A35",
    props: [
      { id: "town-hall", x: 150, y: 560, s: 1.6 },
      { id: "watchtower", x: 300, y: 590, s: 1.0 },
    ],
  },
  battle: {
    sky: ["#21151B", "#7A2E26", "#E06A3A"],
    sun: "#FFB070",
    far: "#4A2A2C",
    mid: "#3A2226",
    trees: "#2A1B1E",
    near: "#241719",
    nearTop: "#3B2A24",
    props: [
      { id: "military-command", x: 110, y: 600, s: 1.2 },
      { id: "siege-workshop", x: 290, y: 615, s: 1.1 },
    ],
  },
  night: {
    sky: ["#0D1424", "#1E2D4A", "#3E5476"],
    sun: "#E9E4D0",
    far: "#25344F",
    mid: "#1C293E",
    trees: "#14202B",
    near: "#121C22",
    nearTop: "#1F3036",
    props: [{ id: "city-gate", x: 195, y: 590, s: 1.6 }],
    moon: true,
  },
  feast: {
    sky: ["#141A2A", "#3A2C3E", "#8A4E3E"],
    sun: "#F6B66A",
    far: "#2E2C42",
    mid: "#262636",
    trees: "#1A2220",
    near: "#1B2219",
    nearTop: "#2E3A26",
    props: [{ id: "war-hall", x: 190, y: 590, s: 1.7 }],
    moon: true,
  },
  road: {
    sky: ["#2A3C52", "#6E7E86", "#D9B983"],
    sun: "#FFE3A8",
    far: "#5C6A78",
    mid: "#46584F",
    trees: "#2F4433",
    near: "#2B3F2A",
    nearTop: "#48663B",
    props: [
      { id: "trading-post", x: 260, y: 600, s: 1.2 },
      { id: "embassy", x: 95, y: 575, s: 1.0 },
    ],
  },
  iron: {
    sky: ["#171B21", "#3A424E", "#7D8691"],
    sun: "#D9DEE4",
    far: "#4A525D",
    mid: "#3A414B",
    trees: "#262B30",
    near: "#22262B",
    nearTop: "#3B4048",
    props: [{ id: "iron-mine", x: 195, y: 600, s: 1.5 }],
  },
  wood: {
    sky: ["#16221B", "#36503A", "#9DB27A"],
    sun: "#EAF1C4",
    far: "#3C5240",
    mid: "#2C4231",
    trees: "#1E3023",
    near: "#1C2B1E",
    nearTop: "#33502F",
    props: [{ id: "sawmill", x: 195, y: 600, s: 1.5 }],
  },
  clay: {
    sky: ["#24170F", "#6A3A26", "#D1834F"],
    sun: "#FFC78E",
    far: "#5A3A2C",
    mid: "#47302A",
    trees: "#2E221D",
    near: "#2A1E18",
    nearTop: "#5A3B28",
    props: [{ id: "brickyard", x: 195, y: 600, s: 1.5 }],
  },
  crop: {
    sky: ["#2A2416", "#7A6233", "#E8BE5C"],
    sun: "#FFF0B0",
    far: "#6E6040",
    mid: "#55502F",
    trees: "#353B22",
    near: "#33381E",
    nearTop: "#6A7A34",
    props: [{ id: "windmill", x: 195, y: 590, s: 1.5 }],
  },
};

const W = 390;
const H = 844;

/** A wavy horizon at height y, closed down to the bottom. */
const ridge = (y: number, amp: number, seed: number, steps = 9) => {
  let d = `M 0 ${H} L 0 ${y}`;

  for (let i = 1; i <= steps; i++) {
    const x = (W / steps) * i;
    const k = Math.sin(i * 1.7 + seed) * 0.6 + Math.sin(i * 0.6 + seed * 2) * 0.4;
    const peak = y - Math.abs(k) * amp;

    d += ` L ${x - W / steps / 2} ${peak} L ${x} ${y - k * amp * 0.3}`;
  }

  return `${d} L ${W} ${H} Z`;
};

const hill = (y: number, bulge: number) => `M 0 ${H} L 0 ${y + 40} Q ${W / 2} ${y - bulge} ${W} ${y + 40} L ${W} ${H} Z`;

export const Scene = ({ kind, className }: { kind: SceneKind; className?: string }) => {
  const id = useId().replace(/:/g, "");
  const L = LOOKS[kind];

  return (
    <svg aria-hidden="true" className={className} preserveAspectRatio="xMidYMax slice" viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <linearGradient id={`${id}sky`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={L.sky[0]} />
          <stop offset="0.45" stopColor={L.sky[1]} />
          <stop offset="0.7" stopColor={L.sky[2]} />
        </linearGradient>
      </defs>
      <rect fill={`url(#${id}sky)`} height={H} width={W} />
      {/* Sun or moon */}
      <circle cx={L.moon ? 300 : 120} cy={L.moon ? 150 : 400} fill={L.sun} opacity={L.moon ? 0.9 : 0.85} r={L.moon ? 34 : 58} />
      {L.moon && <circle cx="314" cy="140" fill={L.sky[0]} r="30" />}
      {L.moon &&
        Array.from({ length: 24 }, (_, i) => (
          <circle key={i} cx={(i * 97) % W} cy={30 + ((i * 53) % 300)} fill="#fff" opacity={0.3 + ((i * 7) % 5) / 10} r={i % 4 === 0 ? 1.6 : 1} />
        ))}
      {/* Clouds */}
      {!L.moon &&
        [
          [60, 200, 1],
          [280, 140, 0.8],
          [200, 300, 0.6],
        ].map(([x, y, s], i) => (
          <g key={i} fill="#fff" opacity="0.12" transform={`translate(${x} ${y}) scale(${s})`}>
            <ellipse cx="0" cy="0" rx="50" ry="12" />
            <ellipse cx="-14" cy="-8" rx="22" ry="12" />
            <ellipse cx="16" cy="-10" rx="18" ry="11" />
          </g>
        ))}
      <path d={ridge(470, 120, 1)} fill={L.far} />
      <path d={ridge(540, 70, 4, 7)} fill={L.mid} />
      {/* Tree line */}
      <g transform="translate(0 0)">
        <path d={hill(575, 40)} fill={L.trees} />
        {Array.from({ length: 16 }, (_, i) => {
          const x = i * 26 + ((i * 13) % 11);
          const y = 600 - Math.sin((x / W) * Math.PI) * 16;

          return (
            <g key={i} transform={`translate(${x} ${y}) scale(${1.1 + (i % 3) * 0.2})`}>
              <polygon fill={L.trees} points="0,-34 -10,0 10,0" />
            </g>
          );
        })}
      </g>
      {/* Foreground hill with buildings */}
      <path d={hill(610, 70)} fill={L.nearTop} />
      <path d={hill(660, 40)} fill={L.near} />
      {L.props.map((p, i) => {
        const draw = BUILDING_ART[p.id];
        const size = 128 * p.s;

        return draw ? (
          <svg key={i} height={size} overflow="visible" viewBox="0 0 128 128" width={size} x={p.x - size / 2} y={p.y - size * 0.82}>
            {draw(2)}
          </svg>
        ) : null;
      })}
      {kind === "wood" || kind === "dusk" || kind === "road" ? (
        <svg height="200" overflow="visible" viewBox="0 0 128 128" width="200" x="-30" y="520">
          <Pine s={1.4} x={-10} y={10} />
          <Pine s={1.1} x={12} y={22} />
        </svg>
      ) : null}
    </svg>
  );
};
