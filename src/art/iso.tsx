/**
 * Isometric drawing kit for Valorians art.
 *
 * Every piece of art is drawn in a 128×128 box. The ground plane is 2:1
 * dimetric: x runs to the lower right, y to the lower left, z straight up.
 * The ground origin (0,0,0) sits at (64, 98) on screen. A building's
 * footprint usually spans −30…30 on both axes.
 *
 * Shading is always three flat tones: top (lit), left face (+y, half lit),
 * right face (+x, shade). Light comes from the upper left. Every shape gets
 * the same thin dark outline.
 */
import React from "react";

import { MAT, Material, OUTLINE } from "./palette";

export const ORIGIN = { x: 64, y: 98 };

export type V3 = [number, number, number];

/** Ground/space point to screen. */
export const P = (x: number, y: number, z = 0) => ({ x: ORIGIN.x + (x - y), y: ORIGIN.y + (x + y) / 2 - z });

export const pts = (...list: V3[]) =>
  list
    .map(([x, y, z]) => {
      const p = P(x, y, z);

      return `${round(p.x)},${round(p.y)}`;
    })
    .join(" ");

const round = (n: number) => Math.round(n * 10) / 10;

const line = { stroke: OUTLINE, strokeWidth: 1.3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

export const Poly = ({ p, fill, outline = true, opacity }: { p: V3[]; fill: string; outline?: boolean; opacity?: number }) => (
  <polygon fill={fill} opacity={opacity} points={pts(...p)} {...(outline ? line : {})} />
);

export const Line = ({ a, b, color = OUTLINE, w = 1.3, opacity }: { a: V3; b: V3; color?: string; w?: number; opacity?: number }) => {
  const p = P(...a);
  const q = P(...b);

  return <line opacity={opacity} stroke={color} strokeLinecap="round" strokeWidth={w} x1={round(p.x)} x2={round(q.x)} y1={round(p.y)} y2={round(q.y)} />;
};

type BoxProps = {
  /** Centre of the footprint. */
  x?: number;
  y?: number;
  z?: number;
  /** Size along x, y and height. */
  w: number;
  d: number;
  h: number;
  m: Material;
  /** Draw the top face (off for boxes that get a roof). */
  top?: boolean;
};

/** A block: the workhorse for walls, plinths, crates and towers. */
export const Box = ({ x = 0, y = 0, z = 0, w, d, h, m, top = true }: BoxProps) => {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const y0 = y - d / 2;
  const y1 = y + d / 2;
  const z1 = z + h;

  return (
    <g>
      <Poly fill={m.left} p={[[x0, y1, z], [x1, y1, z], [x1, y1, z1], [x0, y1, z1]]} />
      <Poly fill={m.right} p={[[x1, y0, z], [x1, y1, z], [x1, y1, z1], [x1, y0, z1]]} />
      {top && <Poly fill={m.top} p={[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]} />}
    </g>
  );
};

type RoofProps = {
  x?: number;
  y?: number;
  /** Height of the eaves. */
  z: number;
  w: number;
  d: number;
  /** Rise from eaves to ridge. */
  h: number;
  m: Material;
  /** Which way the ridge runs. */
  ridge?: "x" | "y";
  /** Overhang past the walls. */
  over?: number;
  /** Colour of the gable ends (usually the wall material). */
  gable?: Material;
};

/** A pitched roof with gable ends. */
export const Gable = ({ x = 0, y = 0, z, w, d, h, m, ridge = "x", over = 3, gable }: RoofProps) => {
  const x0 = x - w / 2 - over;
  const x1 = x + w / 2 + over;
  const y0 = y - d / 2 - over;
  const y1 = y + d / 2 + over;
  const g = gable ?? m;

  if (ridge === "x") {
    const yc = y;

    return (
      <g>
        <Poly fill={m.top} p={[[x0, y0, z], [x1, y0, z], [x1, yc, z + h], [x0, yc, z + h]]} />
        <Poly fill={g.right} p={[[x + w / 2, y - d / 2, z], [x + w / 2, y + d / 2, z], [x + w / 2, yc, z + h - 1]]} />
        <Poly fill={m.left} p={[[x0, y1, z], [x1, y1, z], [x1, yc, z + h], [x0, yc, z + h]]} />
        <Line a={[x0, yc, z + h]} b={[x1, yc, z + h]} w={1.6} />
      </g>
    );
  }
  const xc = x;

  return (
    <g>
      <Poly fill={m.top} p={[[x0, y0, z], [x0, y1, z], [xc, y1, z + h], [xc, y0, z + h]]} />
      <Poly fill={m.right} p={[[x1, y0, z], [x1, y1, z], [xc, y1, z + h], [xc, y0, z + h]]} />
      <Poly fill={g.left} p={[[x - w / 2, y + d / 2, z], [x + w / 2, y + d / 2, z], [xc, y + d / 2, z + h - 1]]} />
      <Line a={[xc, y0, z + h]} b={[xc, y1, z + h]} w={1.6} />
    </g>
  );
};

/** A four-sided pointed roof. */
export const Pyramid = ({ x = 0, y = 0, z, w, d, h, m, over = 2 }: Omit<RoofProps, "ridge" | "gable">) => {
  const x0 = x - w / 2 - over;
  const x1 = x + w / 2 + over;
  const y0 = y - d / 2 - over;
  const y1 = y + d / 2 + over;
  const apex: V3 = [x, y, z + h];

  return (
    <g>
      <Poly fill={m.left} p={[[x0, y1, z], [x1, y1, z], apex]} />
      <Poly fill={m.right} p={[[x1, y0, z], [x1, y1, z], apex]} />
    </g>
  );
};

/** Upright cylinder: towers, barrels, wells, logs on end. */
export const Cylinder = ({ x = 0, y = 0, z = 0, r, h, m, top = true }: { x?: number; y?: number; z?: number; r: number; h: number; m: Material; top?: boolean }) => {
  const c0 = P(x, y, z);
  const c1 = P(x, y, z + h);
  const rx = r * 1.414;
  const ry = r * 0.707;
  const body = `M ${c0.x - rx} ${c1.y} L ${c0.x - rx} ${c0.y} A ${rx} ${ry} 0 0 0 ${c0.x + rx} ${c0.y} L ${c0.x + rx} ${c1.y} Z`;
  const shade = `M ${c0.x + rx * 0.15} ${c1.y + ry} L ${c0.x + rx * 0.15} ${c0.y + ry * 0.99} A ${rx} ${ry} 0 0 0 ${c0.x + rx} ${c0.y} L ${c0.x + rx} ${c1.y} Z`;

  return (
    <g>
      <path d={body} fill={m.left} {...line} />
      <path d={shade} fill={m.right} />
      <path d={body} fill="none" {...line} />
      {top && <ellipse cx={c1.x} cy={c1.y} fill={m.top} rx={rx} ry={ry} {...line} />}
    </g>
  );
};

/** Cone roof for round towers. */
export const Cone = ({ x = 0, y = 0, z, r, h, m }: { x?: number; y?: number; z: number; r: number; h: number; m: Material }) => {
  const c = P(x, y, z);
  const a = P(x, y, z + h);
  const rx = r * 1.414;
  const ry = r * 0.707;

  return (
    <g>
      <path d={`M ${c.x - rx} ${c.y} A ${rx} ${ry} 0 0 0 ${c.x + rx} ${c.y} L ${a.x} ${a.y} Z`} fill={m.left} {...line} />
      <path d={`M ${c.x + rx * 0.1} ${c.y + ry} A ${rx} ${ry} 0 0 0 ${c.x + rx} ${c.y} L ${a.x} ${a.y} Z`} fill={m.right} {...line} />
    </g>
  );
};

/** Half dome on a round base. */
export const Dome = ({ x = 0, y = 0, z, r, m }: { x?: number; y?: number; z: number; r: number; m: Material }) => {
  const c = P(x, y, z);
  const rx = r * 1.414;
  const ry = r * 0.707;
  const top = rx * 0.95;

  return (
    <g>
      <path d={`M ${c.x - rx} ${c.y} A ${rx} ${ry} 0 0 0 ${c.x + rx} ${c.y} A ${rx} ${top} 0 0 0 ${c.x - rx} ${c.y} Z`} fill={m.left} {...line} />
      <path d={`M ${c.x} ${c.y - top} A ${rx} ${top} 0 0 1 ${c.x + rx} ${c.y} A ${rx} ${ry} 0 0 1 ${c.x} ${c.y + ry} Z`} fill={m.right} />
      <path d={`M ${c.x - rx} ${c.y} A ${rx} ${ry} 0 0 0 ${c.x + rx} ${c.y} A ${rx} ${top} 0 0 0 ${c.x - rx} ${c.y} Z`} fill="none" {...line} />
      <ellipse cx={c.x - rx * 0.35} cy={c.y - top * 0.55} fill="#fff" opacity="0.25" rx={rx * 0.22} ry={top * 0.14} />
    </g>
  );
};

/** Flat rectangle on the +y (front-left) face of a wall at y = face. u runs along x. */
export const OnLeft = ({ face, u0, u1, z0, z1, fill, outline = true }: { face: number; u0: number; u1: number; z0: number; z1: number; fill: string; outline?: boolean }) => (
  <Poly fill={fill} outline={outline} p={[[u0, face, z0], [u1, face, z0], [u1, face, z1], [u0, face, z1]]} />
);

/** Flat rectangle on the +x (front-right) face of a wall at x = face. u runs along y. */
export const OnRight = ({ face, u0, u1, z0, z1, fill, outline = true }: { face: number; u0: number; u1: number; z0: number; z1: number; fill: string; outline?: boolean }) => (
  <Poly fill={fill} outline={outline} p={[[face, u0, z0], [face, u1, z0], [face, u1, z1], [face, u0, z1]]} />
);

/** Arched door on the front-left face. */
export const DoorLeft = ({ face, u, w, h, z = 0, fill = MAT.darkWood.left }: { face: number; u: number; w: number; h: number; z?: number; fill?: string }) => {
  const a = P(u - w / 2, face, z);
  const b = P(u + w / 2, face, z);
  const ta = P(u - w / 2, face, z + h - w / 2);
  const tb = P(u + w / 2, face, z + h - w / 2);

  return (
    <path
      d={`M ${a.x} ${a.y} L ${ta.x} ${ta.y} Q ${(ta.x + tb.x) / 2} ${(ta.y + tb.y) / 2 - w * 0.9} ${tb.x} ${tb.y} L ${b.x} ${b.y} Z`}
      fill={fill}
      {...line}
    />
  );
};

/** Arched door on the front-right face. */
export const DoorRight = ({ face, u, w, h, z = 0, fill = MAT.darkWood.right }: { face: number; u: number; w: number; h: number; z?: number; fill?: string }) => {
  const a = P(face, u - w / 2, z);
  const b = P(face, u + w / 2, z);
  const ta = P(face, u - w / 2, z + h - w / 2);
  const tb = P(face, u + w / 2, z + h - w / 2);

  return (
    <path
      d={`M ${a.x} ${a.y} L ${ta.x} ${ta.y} Q ${(ta.x + tb.x) / 2} ${(ta.y + tb.y) / 2 - w * 0.9} ${tb.x} ${tb.y} L ${b.x} ${b.y} Z`}
      fill={fill}
      {...line}
    />
  );
};

/** Lit window: a warm pane with a cross frame. */
export const WinLeft = ({ face, u, z, w = 5, h = 6 }: { face: number; u: number; z: number; w?: number; h?: number }) => (
  <g>
    <OnLeft face={face} fill="#F6C566" u0={u - w / 2} u1={u + w / 2} z0={z} z1={z + h} />
    <Line a={[u, face, z]} b={[u, face, z + h]} w={1} />
  </g>
);

export const WinRight = ({ face, u, z, w = 5, h = 6 }: { face: number; u: number; z: number; w?: number; h?: number }) => (
  <g>
    <OnRight face={face} fill="#D9A64B" u0={u - w / 2} u1={u + w / 2} z0={z} z1={z + h} />
    <Line a={[face, u, z]} b={[face, u, z + h]} w={1} />
  </g>
);

/** Battlements around the top of a box, drawn back to front. */
export const Crenels = ({ x = 0, y = 0, z, w, d, m, n = 3, size = 4 }: { x?: number; y?: number; z: number; w: number; d: number; m: Material; n?: number; size?: number }) => {
  const x0 = x - w / 2 + size / 2;
  const x1 = x + w / 2 - size / 2;
  const y0 = y - d / 2 + size / 2;
  const y1 = y + d / 2 - size / 2;
  const spots: [number, number][] = [];
  const along = (a: number, b: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

  along(x0, x1).forEach((cx) => spots.push([cx, y0], [cx, y1]));
  along(y0, y1)
    .slice(1, -1)
    .forEach((cy) => spots.push([x0, cy], [x1, cy]));
  spots.sort((p, q) => p[0] + p[1] - (q[0] + q[1]));

  return (
    <g>
      {spots.map(([cx, cy], i) => (
        <Box key={i} d={size} h={size} m={m} w={size} x={cx} y={cy} z={z} />
      ))}
    </g>
  );
};

/** A pennant on a pole. */
export const Flag = ({ x, y, z, h = 16, color = "#C9452E" }: { x: number; y: number; z: number; h?: number; color?: string }) => {
  const b = P(x, y, z);
  const t = P(x, y, z + h);

  return (
    <g>
      <line stroke={OUTLINE} strokeLinecap="round" strokeWidth="1.6" x1={b.x} x2={t.x} y1={b.y} y2={t.y} />
      <path d={`M ${t.x} ${t.y} L ${t.x + 11} ${t.y + 2.5} L ${t.x} ${t.y + 6} Z`} fill={color} {...line} strokeWidth={1} />
    </g>
  );
};

/** The ground slab every building stands on. */
export const Plate = ({ w = 52, d = 52, m = MAT.grass, h = 4 }: { w?: number; d?: number; m?: Material; h?: number }) => (
  <g>
    <ellipse cx={ORIGIN.x + 6} cy={ORIGIN.y + 6} fill="#000" opacity="0.18" rx={w * 0.95} ry={d * 0.38} />
    <Box d={d} h={h} m={m} w={w} z={-h} />
  </g>
);

/** Puff of chimney smoke. */
export const Smoke = ({ x, y, z }: { x: number; y: number; z: number }) => {
  const p = P(x, y, z);

  return (
    <g className="motion-safe:animate-[smoke_3.2s_ease-out_infinite]" opacity="0.7" style={{ transformBox: "fill-box", transformOrigin: "bottom" }}>
      <circle cx={p.x} cy={p.y - 4} fill="#E9E1D2" r="3" />
      <circle cx={p.x + 3} cy={p.y - 9} fill="#E9E1D2" r="4" />
      <circle cx={p.x + 1} cy={p.y - 15} fill="#E9E1D2" r="3.2" />
    </g>
  );
};

/** Little wooden crate. */
export const Crate = ({ x, y, z = 0, s = 6 }: { x: number; y: number; z?: number; s?: number }) => (
  <g>
    <Box d={s} h={s} m={MAT.wood} w={s} x={x} y={y} z={z} />
    <Line a={[x - s / 2, y + s / 2, z]} b={[x + s / 2, y + s / 2, z + s]} w={0.9} />
    <Line a={[x + s / 2, y - s / 2, z]} b={[x + s / 2, y + s / 2, z + s]} w={0.9} />
  </g>
);

/** Barrel. */
export const Barrel = ({ x, y, z = 0, r = 3, h = 7, m = MAT.wood }: { x: number; y: number; z?: number; r?: number; h?: number; m?: Material }) => (
  <g>
    <Cylinder h={h} m={m} r={r} x={x} y={y} z={z} />
    <Line a={[x - r, y + r, z + h * 0.3]} b={[x + r, y + r, z + h * 0.3]} opacity={0} />
  </g>
);

/** Log lying along x. */
export const Log = ({ x, y, z = 0, len = 16, r = 2.4 }: { x: number; y: number; z?: number; len?: number; r?: number }) => {
  const a = P(x - len / 2, y, z + r);
  const b = P(x + len / 2, y, z + r);

  return (
    <g>
      <line stroke={OUTLINE} strokeLinecap="round" strokeWidth={r * 2 + 2.6} x1={a.x} x2={b.x} y1={a.y} y2={b.y} />
      <line stroke={MAT.wood.left} strokeLinecap="round" strokeWidth={r * 2} x1={a.x} x2={b.x} y1={a.y} y2={b.y} />
      <ellipse cx={b.x} cy={b.y} fill="#E2B87A" rx={r * 0.9} ry={r * 1.05} {...line} strokeWidth={1} />
    </g>
  );
};

/** Pine tree. */
export const Pine = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => {
  const b = P(x, y, 0);

  return (
    <g transform={`translate(${b.x} ${b.y}) scale(${s})`}>
      <ellipse cx="4" cy="1" fill="#000" opacity="0.18" rx="9" ry="3" />
      <rect fill={MAT.darkWood.left} height="6" width="3" x="-1.5" y="-5" {...line} strokeWidth={1} />
      <polygon fill={MAT.pine.left} points="0,-30 -9,-6 9,-6" {...line} />
      <polygon fill={MAT.pine.right} points="0,-30 9,-6 0,-6" />
      <polygon fill={MAT.pine.left} points="0,-38 -7,-18 7,-18" {...line} />
      <polygon fill={MAT.pine.right} points="0,-38 7,-18 0,-18" />
    </g>
  );
};

/** Round leafy tree. */
export const Tree = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => {
  const b = P(x, y, 0);

  return (
    <g transform={`translate(${b.x} ${b.y}) scale(${s})`}>
      <ellipse cx="5" cy="1" fill="#000" opacity="0.18" rx="10" ry="3.5" />
      <rect fill={MAT.darkWood.left} height="10" width="3" x="-1.5" y="-9" {...line} strokeWidth={1} />
      <circle cx="0" cy="-17" fill={MAT.leaf.left} r="9" {...line} />
      <path d="M 0 -26 A 9 9 0 0 1 0 -8 A 6 9 0 0 0 0 -26 Z" fill={MAT.leaf.right} />
      <circle cx="-3" cy="-20" fill={MAT.leaf.top} r="3" />
    </g>
  );
};

/** Grass tuft for decoration on plates. */
export const Tuft = ({ x, y }: { x: number; y: number }) => {
  const p = P(x, y, 0);

  return <path d={`M ${p.x - 2} ${p.y} l -1 -3 M ${p.x} ${p.y} l 0 -4 M ${p.x + 2} ${p.y} l 1 -3`} stroke={MAT.grass.right} strokeLinecap="round" strokeWidth="1.1" />;
};

/** Root svg for one piece of art. */
export const Art = ({ children, title, className, style }: { children: React.ReactNode; title?: string; className?: string; style?: React.CSSProperties }) => (
  <svg
    aria-hidden={title ? undefined : true}
    className={className}
    overflow="visible"
    role={title ? "img" : undefined}
    style={style}
    viewBox="0 0 128 128"
  >
    {title && <title>{title}</title>}
    <g transform={`translate(${ORIGIN.x} ${ORIGIN.y}) scale(1.12) translate(${-ORIGIN.x} ${-ORIGIN.y})`}>{children}</g>
  </svg>
);
