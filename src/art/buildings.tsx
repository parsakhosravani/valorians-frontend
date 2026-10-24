/**
 * Every building, drawn with the iso kit. Each function draws back to front.
 * `tier` grows with the building's level: 0 (not built), 1 (1–7),
 * 2 (8–14, adds a banner), 3 (15+, gold trim).
 */
import React from "react";

import {
  Art,
  Barrel,
  Box,
  Cone,
  Crate,
  Crenels,
  Cylinder,
  Dome,
  DoorLeft,
  DoorRight,
  Flag,
  Gable,
  Line,
  Log,
  OnLeft,
  OnRight,
  P,
  Pine,
  Plate,
  Poly,
  Pyramid,
  Smoke,
  Tree,
  Tuft,
  WinLeft,
  WinRight,
} from "./iso";
import { MAT, OUTLINE } from "./palette";

export type Tier = 0 | 1 | 2 | 3;

export const tierFor = (level: number): Tier => (level <= 0 ? 0 : level < 8 ? 1 : level < 15 ? 2 : 3);

type Draw = (t: Tier) => React.ReactNode;

const banner = (t: Tier) => (t === 3 ? "#F0B847" : "#C9452E");
/** Roofs keep their material at every tier; tier 3 is marked by gold banners instead. */
const roofOf = (_t: Tier, base = MAT.redRoof) => base;

// ─── Core ────────────────────────────────────────────────────────────────────

const townHall: Draw = (t) => (
  <>
    <Plate m={MAT.cobble} />
    <Tuft x={-24} y={22} />
    {/* Side annex */}
    <Box d={18} h={14} m={MAT.plaster} w={14} x={-17} y={-6} />
    <Gable d={18} gable={MAT.plaster} h={8} m={MAT.thatch} ridge="y" w={14} x={-17} y={-6} z={14} />
    {/* Great hall */}
    <Box d={30} h={7} m={MAT.stone} w={36} x={4} y={4} />
    <Box d={30} h={15} m={MAT.wood} top={false} w={36} x={4} y={4} z={7} />
    <WinLeft face={19} u={-7} z={11} />
    <WinLeft face={19} u={15} z={11} />
    <WinRight face={22} u={-3} z={11} />
    <WinRight face={22} u={11} z={11} />
    <Box d={4} h={30} m={MAT.stone} w={5} x={-6} y={-6} z={14} />
    <Smoke x={-6} y={-6} z={46} />
    <Gable d={30} gable={MAT.wood} h={22} m={MAT.thatch} over={4} ridge="x" w={36} x={4} y={4} z={22} />
    {/* Porch */}
    <Box d={6} h={2} m={MAT.cobble} w={12} x={4} y={22} />
    <DoorLeft face={19} h={13} u={4} w={8} z={3} />
    <Poly fill={MAT.gold.left} p={[[1, 19, 23], [7, 19, 23], [7, 19, 27], [1, 19, 27]]} />
    <Flag color={banner(t)} h={18} x={22} y={4} z={30} />
    {t >= 2 && <Flag color={banner(t)} h={14} x={-14} y={-6} z={22} />}
  </>
);

const cityGate: Draw = (t) => {
  const s = MAT.slate;

  return (
    <>
      <Plate m={MAT.cobble} />
      {/* Back tower */}
      <Box d={14} h={42} m={MAT.stone} top={false} w={14} x={-14} y={-14} />
      <Pyramid d={14} h={14} m={s} w={14} x={-14} y={-14} z={42} />
      {/* Wall between the towers with the arch */}
      <Box d={10} h={30} m={MAT.stone} w={36} x={0} y={4} />
      <Crenels d={10} m={MAT.stone} n={5} w={36} x={0} y={4} z={30} />
      <DoorLeft face={9} h={22} u={0} w={13} />
      <OnLeft face={9} fill={MAT.darkWood.right} u0={-5} u1={5} z0={0} z1={13} />
      <Line a={[0, 9, 0]} b={[0, 9, 13]} />
      {/* Front tower */}
      <Box d={14} h={42} m={MAT.stone} top={false} w={14} x={18} y={-12} />
      <WinRight face={25} u={-12} w={3} z={28} />
      <Pyramid d={14} h={14} m={s} w={14} x={18} y={-12} z={42} />
      <Box d={14} h={36} m={MAT.stone} top={false} w={14} x={-18} y={16} />
      <WinLeft face={23} u={-18} w={3} z={22} />
      <Pyramid d={14} h={14} m={s} w={14} x={-18} y={16} z={36} />
      {t >= 2 && <Flag color={banner(t)} x={18} y={-12} z={56} />}
    </>
  );
};

const watchtower: Draw = (t) => (
  <>
    <Plate m={MAT.grass} w={44} d={44} />
    {/* Stilts */}
    {[
      [-8, -8],
      [8, -8],
      [-8, 8],
      [8, 8],
    ].map(([x, y], i) => (
      <Box key={i} d={3} h={46} m={MAT.darkWood} w={3} x={x} y={y} />
    ))}
    <Line a={[-8, 8, 4]} b={[8, 8, 40]} w={1.6} />
    <Line a={[8, 8, 4]} b={[-8, 8, 40]} w={1.6} />
    <Line a={[8, -8, 4]} b={[8, 8, 40]} w={1.6} />
    <Line a={[8, 8, 4]} b={[8, -8, 40]} w={1.6} />
    {/* Lookout */}
    <Box d={22} h={4} m={MAT.wood} w={22} z={44} />
    <Box d={20} h={10} m={MAT.wood} top={false} w={20} z={48} />
    <OnLeft face={10} fill={MAT.darkWood.left} u0={-6} u1={6} z0={51} z1={56} />
    <OnRight face={10} fill={MAT.darkWood.right} u0={-6} u1={6} z0={51} z1={56} />
    <Pyramid d={20} h={16} m={roofOf(t)} over={4} w={20} z={58} />
    {t >= 2 && <Flag color={banner(t)} x={0} y={0} z={74} />}
  </>
);

// ─── Economy ─────────────────────────────────────────────────────────────────

const windmill: Draw = (t) => {
  const hub = P(4, 14, 44);
  const sail = (deg: number) => (
    <g key={deg} transform={`rotate(${deg} ${hub.x} ${hub.y})`}>
      <line stroke={OUTLINE} strokeWidth="2.2" x1={hub.x} x2={hub.x} y1={hub.y} y2={hub.y - 34} />
      <rect fill={MAT.cloth.left} height="24" stroke={OUTLINE} strokeWidth="1.1" width="8" x={hub.x + 1} y={hub.y - 33} />
      <line opacity="0.5" stroke={OUTLINE} strokeWidth="0.8" x1={hub.x + 5} x2={hub.x + 5} y1={hub.y - 33} y2={hub.y - 9} />
    </g>
  );

  return (
    <>
      <Plate m={MAT.grass} />
      {/* Field rows */}
      {[-20, -14, -8].map((y) => (
        <Line key={y} a={[-26, y + 18, 0]} b={[-6, y + 18, 0]} color={MAT.crop.left} w={2.4} />
      ))}
      <Cylinder h={40} m={MAT.stone} r={13} top={false} x={0} y={0} />
      <DoorLeft face={11} h={10} u={0} w={6} />
      <WinRight face={12} u={-2} w={3} z={24} />
      <Cone h={20} m={roofOf(t, MAT.thatch)} r={15} z={40} />
      <g className="motion-safe:animate-[spin_14s_linear_infinite]" style={{ transformOrigin: `${hub.x}px ${hub.y}px` }}>
        {[20, 110, 200, 290].map(sail)}
      </g>
      <circle cx={hub.x} cy={hub.y} fill={MAT.darkWood.left} r="3" stroke={OUTLINE} strokeWidth="1.2" />
      <Box d={6} h={4} m={MAT.hay} w={8} x={20} y={-14} />
      <Crate x={22} y={20} />
      {t >= 2 && <Flag color={banner(t)} x={0} y={0} z={60} />}
    </>
  );
};

const sawmill: Draw = (t) => (
  <>
    <Plate m={MAT.dirt} />
    <Pine s={0.9} x={-24} y={-22} />
    <Box d={26} h={16} m={MAT.wood} top={false} w={30} x={-2} y={-2} />
    <WinRight face={13} u={-6} z={7} />
    <OnLeft face={11} fill={MAT.darkWood.left} u0={-12} u1={2} z0={0} z1={12} />
    <Gable d={26} gable={MAT.wood} h={14} m={roofOf(t, MAT.redRoof)} ridge="x" w={30} x={-2} y={-2} z={16} />
    {/* Saw blade */}
    <circle cx={P(18, 6, 12).x} cy={P(18, 6, 12).y} fill={MAT.iron.top} r="7" stroke={OUTLINE} strokeWidth="1.3" />
    <circle cx={P(18, 6, 12).x} cy={P(18, 6, 12).y} fill={MAT.iron.right} r="2" />
    <Box d={6} h={6} m={MAT.darkWood} w={16} x={18} y={8} />
    {/* Log pile */}
    <Log len={22} x={-6} y={22} />
    <Log len={22} x={-4} y={18} />
    <Log len={20} x={-5} y={20} z={4} />
    <Log len={14} x={18} y={22} />
    {t >= 2 && <Flag color={banner(t)} x={-2} y={-2} z={30} />}
  </>
);

const ironMine: Draw = (t) => (
  <>
    <Plate m={MAT.rock} />
    {/* Mountain */}
    <Poly fill={MAT.rock.left} p={[[-28, 10, 0], [10, 10, 0], [-6, -10, 40]]} />
    <Poly fill={MAT.rock.right} p={[[10, -26, 0], [10, 10, 0], [-6, -10, 40]]} />
    <Poly fill={MAT.rock.top} outline={false} p={[[-6, -10, 40], [-10, -6, 34], [-2, -12, 33]]} />
    <Poly fill={MAT.darkStone.right} p={[[14, -20, 0], [24, -20, 0], [18, -26, 16]]} />
    {/* Timber entrance */}
    <Box d={4} h={18} m={MAT.darkWood} w={3} x={-12} y={12} />
    <Box d={4} h={18} m={MAT.darkWood} w={3} x={4} y={12} />
    <OnLeft face={10} fill="#1F1712" u0={-10.5} u1={2.5} z0={0} z1={16} />
    <Box d={5} h={4} m={MAT.wood} w={22} x={-4} y={12} z={17} />
    {/* Rails and cart */}
    <Line a={[-8, 14, 0]} b={[-8, 30, 0]} w={1.2} />
    <Line a={[0, 14, 0]} b={[0, 30, 0]} w={1.2} />
    <Box d={8} h={6} m={MAT.iron} w={10} x={-4} y={24} z={1} />
    <Poly fill={MAT.darkStone.top} p={[[-8, 21, 7], [0, 21, 7], [0, 27, 7], [-8, 27, 7]]} />
    {/* Ore pile */}
    <Poly fill={MAT.darkStone.left} p={[[12, 18, 0], [26, 18, 0], [20, 12, 8]]} />
    <Poly fill={MAT.iron.right} p={[[26, 6, 0], [26, 18, 0], [20, 12, 8]]} />
    {t >= 2 && <Flag color={banner(t)} x={-6} y={-10} z={40} />}
    {t === 3 && <circle cx={P(18, 14, 6).x} cy={P(18, 14, 6).y} fill={MAT.gold.top} r="2" />}
  </>
);

const brickyard: Draw = (t) => (
  <>
    <Plate m={MAT.dirt} />
    {/* Kiln */}
    <Cylinder h={16} m={MAT.brick} r={11} top={false} x={-10} y={-8} />
    <Dome m={MAT.brick} r={11} x={-10} y={-8} z={16} />
    <DoorLeft face={3} fill="#3A1D10" h={9} u={-10} w={6} />
    <Cylinder h={10} m={MAT.brick} r={2.4} x={-10} y={-8} z={26} />
    <Smoke x={-10} y={-8} z={38} />
    {/* Drying shed */}
    <Box d={4} h={12} m={MAT.darkWood} w={2} x={8} y={-12} />
    <Box d={4} h={12} m={MAT.darkWood} w={2} x={22} y={-12} />
    <Gable d={14} h={6} m={roofOf(t, MAT.thatch)} over={2} ridge="x" w={18} x={15} y={-6} z={12} />
    <Box d={2} h={12} m={MAT.darkWood} w={2} x={8} y={0} />
    <Box d={2} h={12} m={MAT.darkWood} w={2} x={22} y={0} />
    {/* Brick stacks */}
    {[
      [6, 16],
      [16, 16],
      [-4, 20],
    ].map(([x, y], i) => (
      <g key={i}>
        <Box d={6} h={6} m={MAT.brick} w={8} x={x} y={y} />
        <Line a={[x - 4, y + 3, 3]} b={[x + 4, y + 3, 3]} w={0.8} />
      </g>
    ))}
    {t >= 2 && <Flag color={banner(t)} x={22} y={-12} z={18} />}
  </>
);

const warehouse: Draw = (t) => (
  <>
    <Plate m={MAT.dirt} />
    <Box d={36} h={22} m={MAT.wood} top={false} w={34} x={0} y={-2} />
    {[-10, 0, 10].map((u) => (
      <Line key={u} a={[u, 16, 0]} b={[u, 16, 22]} opacity={0.4} />
    ))}
    <OnLeft face={16} fill={MAT.darkWood.left} u0={-8} u1={8} z0={0} z1={16} />
    <Line a={[-8, 16, 0]} b={[8, 16, 16]} />
    <Line a={[8, 16, 0]} b={[-8, 16, 16]} />
    <WinRight face={17} u={-2} z={12} />
    <Gable d={36} gable={MAT.wood} h={18} m={roofOf(t, MAT.slate)} ridge="y" w={34} x={0} y={-2} z={22} />
    <Crate x={22} y={10} />
    <Crate x={22} y={18} />
    <Crate s={5} x={22} y={14} z={6} />
    <Barrel x={-20} y={22} />
    <Barrel x={-14} y={24} />
    {t >= 2 && <Flag color={banner(t)} x={0} y={-2} z={40} />}
  </>
);

const tradingPost: Draw = (t) => {
  const stripes = [MAT.redCloth, MAT.cloth, MAT.redCloth, MAT.cloth];

  return (
    <>
      <Plate m={MAT.cobble} />
      {/* Small house */}
      <Box d={20} h={18} m={MAT.plaster} top={false} w={20} x={-12} y={-12} />
      <WinRight face={-2} u={-12} z={8} />
      <Gable d={20} gable={MAT.plaster} h={12} m={roofOf(t)} ridge="y" w={20} x={-12} y={-12} z={18} />
      {/* Market stall */}
      {[
        [4, 6],
        [24, 6],
        [4, 20],
        [24, 20],
      ].map(([x, y], i) => (
        <Box key={i} d={2} h={16} m={MAT.darkWood} w={2} x={x} y={y} />
      ))}
      <Box d={10} h={6} m={MAT.wood} w={20} x={14} y={16} />
      <Crate s={4} x={8} y={16} z={6} />
      <circle cx={P(16, 16, 9).x} cy={P(16, 16, 9).y} fill={MAT.crop.left} r="2.4" stroke={OUTLINE} strokeWidth="0.8" />
      <circle cx={P(20, 16, 9).x} cy={P(20, 16, 9).y} fill={MAT.redCloth.left} r="2.4" stroke={OUTLINE} strokeWidth="0.8" />
      {stripes.map((m, i) => (
        <Poly key={i} fill={m.left} p={[[2 + i * 6, 22, 15], [8 + i * 6, 22, 15], [8 + i * 6, 13, 21], [2 + i * 6, 13, 21]]} />
      ))}
      <Barrel x={-20} y={14} />
      <Crate x={-12} y={20} />
      <Flag color={banner(t)} h={12} x={24} y={6} z={16} />
    </>
  );
};

const fertilizerWorkshop: Draw = (t) => (
  <>
    <Plate m={MAT.grass} />
    <Box d={22} h={14} m={MAT.darkWood} top={false} w={24} x={-6} y={-8} />
    <WinLeft face={3} u={-12} z={6} />
    <DoorRight face={6} h={10} u={-4} w={6} />
    <Gable d={22} gable={MAT.darkWood} h={10} m={roofOf(t, MAT.greenRoof)} ridge="x" w={24} x={-6} y={-8} z={14} />
    {/* Compost heap and barrels */}
    <Dome m={{ top: "#8A6440", left: "#6E4E2E", right: "#563B22" }} r={8} x={-14} y={16} z={0} />
    <Barrel m={MAT.greenRoof} x={14} y={14} />
    <Barrel m={MAT.greenRoof} x={20} y={18} />
    <Barrel m={MAT.wood} x={12} y={22} />
    {/* Herb rows */}
    <Line a={[18, -18, 0]} b={[18, -4, 0]} color={MAT.leaf.right} w={3} />
    <Line a={[24, -18, 0]} b={[24, -4, 0]} color={MAT.leaf.right} w={3} />
    {t >= 2 && <Flag color={banner(t)} x={-6} y={-8} z={24} />}
  </>
);

// ─── Military ────────────────────────────────────────────────────────────────

const barracks: Draw = (t) => (
  <>
    <Plate m={MAT.dirt} />
    <Box d={20} h={6} m={MAT.stone} w={42} x={0} y={-6} />
    <Box d={20} h={12} m={MAT.wood} top={false} w={42} x={0} y={-6} z={6} />
    {[-14, -2, 10].map((u) => (
      <WinLeft key={u} face={4} u={u} z={9} />
    ))}
    <DoorRight face={21} h={12} u={-6} w={6} z={0} />
    <Gable d={20} gable={MAT.wood} h={12} m={roofOf(t)} ridge="x" w={42} x={0} y={-6} z={18} />
    {/* Weapon rack */}
    <Box d={2} h={10} m={MAT.darkWood} w={16} x={-6} y={18} />
    {[-12, -8, -4, 0].map((x) => (
      <Line key={x} a={[x, 19, 0]} b={[x, 19, 16]} color={MAT.iron.right} w={1.4} />
    ))}
    {/* Shields */}
    <circle cx={P(18, 14, 6).x} cy={P(18, 14, 6).y} fill={MAT.redCloth.left} r="4" stroke={OUTLINE} strokeWidth="1.2" />
    <circle cx={P(18, 14, 6).x} cy={P(18, 14, 6).y} fill={MAT.gold.left} r="1.4" />
    <Flag color={banner(t)} x={20} y={-6} z={26} />
  </>
);

const stable: Draw = (t) => (
  <>
    <Plate m={MAT.dirt} />
    <Box d={22} h={14} m={MAT.wood} top={false} w={38} x={-2} y={-8} />
    {[-14, -2, 10].map((u) => (
      <g key={u}>
        <OnLeft face={3} fill="#2E2117" u0={u - 4} u1={u + 4} z0={0} z1={10} />
        <OnLeft face={3} fill={MAT.wood.right} u0={u - 4} u1={u + 4} z0={0} z1={4} />
      </g>
    ))}
    <Gable d={22} gable={MAT.wood} h={10} m={roofOf(t, MAT.thatch)} ridge="x" w={38} x={-2} y={-8} z={14} />
    {/* Horse head looking out */}
    <path d={`M ${P(-2, 3, 8).x - 2} ${P(-2, 3, 8).y} l 3 -6 l 3 1 l -1 7 z`} fill="#7A4E2E" stroke={OUTLINE} strokeWidth="1" />
    {/* Fence */}
    {[-24, -16, -8, 0, 8, 16, 24].map((x) => (
      <Box key={x} d={2} h={7} m={MAT.darkWood} w={2} x={x} y={24} />
    ))}
    <Line a={[-24, 25, 5]} b={[24, 25, 5]} w={1.6} />
    <Box d={8} h={6} m={MAT.hay} w={10} x={20} y={10} />
    {t >= 2 && <Flag color={banner(t)} x={14} y={-8} z={22} />}
  </>
);

const armory: Draw = (t) => (
  <>
    <Plate m={MAT.cobble} />
    <Box d={26} h={20} m={MAT.darkStone} top={false} w={28} x={-4} y={-4} />
    <OnLeft face={9} fill="#E8732F" u0={-10} u1={-2} z0={2} z1={10} />
    <WinRight face={10} u={-4} z={11} />
    <Gable d={26} gable={MAT.darkStone} h={12} m={roofOf(t, MAT.slate)} ridge="y" w={28} x={-4} y={-4} z={20} />
    <Box d={6} h={36} m={MAT.darkStone} w={6} x={-12} y={-12} />
    <Smoke x={-12} y={-12} z={38} />
    {/* Anvil */}
    <Box d={4} h={5} m={MAT.darkWood} w={4} x={18} y={16} />
    <Box d={5} h={3} m={MAT.iron} w={10} x={18} y={16} z={5} />
    {/* Shields on the wall */}
    {[-14, 6].map((u) => (
      <g key={u}>
        <circle cx={P(u, 9, 14).x} cy={P(u, 9, 14).y} fill={MAT.blueCloth.left} r="3.4" stroke={OUTLINE} strokeWidth="1.1" />
      </g>
    ))}
    {t >= 2 && <Flag color={banner(t)} x={-4} y={-4} z={32} />}
  </>
);

const arsenal: Draw = (t) => (
  <>
    <Plate m={MAT.cobble} />
    <Box d={30} h={24} m={MAT.stone} w={30} x={0} y={-2} />
    <DoorLeft face={13} h={14} u={0} w={10} />
    {/* Crossed spears */}
    <Line a={[-12, 13, 8]} b={[-4, 13, 22]} w={1.6} />
    <Line a={[-4, 13, 8]} b={[-12, 13, 22]} w={1.6} />
    <WinRight face={15} u={-2} z={14} />
    <Crenels d={30} m={MAT.stone} n={4} w={30} x={0} y={-2} z={24} />
    <Barrel x={22} y={18} />
    <Barrel x={18} y={24} />
    <Crate x={-20} y={22} />
    {t >= 2 && <Flag color={banner(t)} x={0} y={-2} z={27} />}
  </>
);

const siegeWorkshop: Draw = (t) => {
  const pivot = P(-2, -6, 14);

  return (
    <>
      <Plate m={MAT.dirt} />
      {/* Open frame shed */}
      {[
        [-20, -20],
        [0, -20],
        [-20, -4],
      ].map(([x, y], i) => (
        <Box key={i} d={2} h={18} m={MAT.darkWood} w={2} x={x} y={y} />
      ))}
      <Gable d={18} h={8} m={roofOf(t, MAT.thatch)} over={2} ridge="x" w={22} x={-10} y={-12} z={18} />
      {/* Catapult */}
      <Box d={10} h={4} m={MAT.wood} w={18} x={-2} y={-6} />
      <Box d={2} h={14} m={MAT.darkWood} w={2} x={-2} y={-10} z={0} />
      <Box d={2} h={14} m={MAT.darkWood} w={2} x={-2} y={-2} z={0} />
      <line stroke={OUTLINE} strokeLinecap="round" strokeWidth="4.2" x1={pivot.x - 16} x2={pivot.x + 12} y1={pivot.y - 14} y2={pivot.y + 6} />
      <line stroke={MAT.wood.left} strokeLinecap="round" strokeWidth="2.4" x1={pivot.x - 16} x2={pivot.x + 12} y1={pivot.y - 14} y2={pivot.y + 6} />
      <ellipse cx={pivot.x - 16} cy={pivot.y - 15} fill={MAT.darkWood.left} rx="4" ry="2.4" stroke={OUTLINE} strokeWidth="1" />
      {/* Ram on wheels */}
      <Box d={8} h={4} m={MAT.wood} w={20} x={12} y={16} z={2} />
      <Log len={26} r={2.6} x={12} y={16} z={6} />
      {[
        [5, 21],
        [19, 21],
      ].map(([x, y], i) => (
        <circle key={i} cx={P(x, y, 2).x} cy={P(x, y, 2).y} fill={MAT.darkWood.left} r="3.4" stroke={OUTLINE} strokeWidth="1.1" />
      ))}
      {t >= 2 && <Flag color={banner(t)} x={0} y={-20} z={20} />}
    </>
  );
};

const militaryCommand: Draw = (t) => {
  const c = MAT.redCloth;

  return (
    <>
      <Plate m={MAT.grass} />
      {/* Big command tent */}
      <Box d={28} h={12} m={MAT.cloth} top={false} w={28} x={-2} y={-2} />
      {[-12, -2, 8].map((u) => (
        <OnLeft key={u} face={12} fill={c.left} outline={false} u0={u} u1={u + 4} z0={0} z1={12} />
      ))}
      {[-12, -2, 8].map((u) => (
        <OnRight key={u} face={12} fill={c.right} outline={false} u0={u} u1={u + 4} z0={0} z1={12} />
      ))}
      <Box d={28} h={12} m={{ ...MAT.cloth, left: "none", right: "none" }} top={false} w={28} x={-2} y={-2} />
      <Pyramid d={28} h={20} m={c} over={3} w={28} x={-2} y={-2} z={12} />
      <Poly fill="#3A2A1C" p={[[-6, 12, 0], [2, 12, 0], [-2, 12, 9]]} />
      <Flag color={banner(t)} h={14} x={-2} y={-2} z={32} />
      {/* Map table */}
      <Box d={8} h={5} m={MAT.wood} w={12} x={18} y={18} />
      <Poly fill={MAT.cloth.top} p={[[14, 15, 5.2], [22, 15, 5.2], [22, 21, 5.2], [14, 21, 5.2]]} />
      <Flag color={MAT.blueCloth.left} h={12} x={-24} y={20} z={0} />
      <Flag color={banner(t)} h={12} x={24} y={-20} z={0} />
    </>
  );
};

const warHall: Draw = (t) => {
  const ends = (x: number, y: number, z: number) => {
    const a = P(x, y, z);

    return (
      <g>
        <line stroke={OUTLINE} strokeLinecap="round" strokeWidth="3.6" x1={a.x - 7} x2={a.x + 2} y1={a.y - 8} y2={a.y + 2} />
        <line stroke={MAT.darkWood.top} strokeLinecap="round" strokeWidth="2" x1={a.x - 7} x2={a.x + 2} y1={a.y - 8} y2={a.y + 2} />
        <line stroke={OUTLINE} strokeLinecap="round" strokeWidth="3.6" x1={a.x + 7} x2={a.x - 2} y1={a.y - 8} y2={a.y + 2} />
        <line stroke={MAT.darkWood.top} strokeLinecap="round" strokeWidth="2" x1={a.x + 7} x2={a.x - 2} y1={a.y - 8} y2={a.y + 2} />
      </g>
    );
  };

  return (
    <>
      <Plate m={MAT.dirt} />
      <Box d={22} h={14} m={MAT.darkWood} top={false} w={44} x={0} y={-4} />
      {[-16, -6, 4, 14].map((u, i) => (
        <g key={u}>
          <circle cx={P(u, 7, 7).x} cy={P(u, 7, 7).y} fill={i % 2 ? MAT.blueCloth.left : MAT.redCloth.left} r="3.6" stroke={OUTLINE} strokeWidth="1.1" />
          <circle cx={P(u, 7, 7).x} cy={P(u, 7, 7).y} fill={MAT.iron.top} r="1.2" />
        </g>
      ))}
      <DoorRight face={22} h={11} u={-4} w={7} />
      <Gable d={22} gable={MAT.darkWood} h={18} m={roofOf(t, MAT.darkWood)} over={3} ridge="x" w={44} x={0} y={-4} z={14} />
      {ends(25, -4, 32)}
      {ends(-25, -4, 32)}
      <Barrel x={-18} y={20} />
      <Box d={6} h={2} m={MAT.darkStone} w={6} x={14} y={18} />
      <Poly fill="#F08A3C" p={[[12, 18, 2], [16, 18, 2], [14, 18, 8]]} />
      {t >= 2 && <Flag color={banner(t)} x={0} y={-4} z={32} />}
    </>
  );
};

const trapmaker: Draw = (t) => (
  <>
    <Plate m={MAT.grass} />
    <Box d={18} h={12} m={MAT.wood} top={false} w={18} x={-10} y={-10} />
    <DoorLeft face={-1} h={9} u={-12} w={5} />
    <Gable d={18} gable={MAT.wood} h={10} m={roofOf(t, MAT.thatch)} ridge="y" w={18} x={-10} y={-10} z={12} />
    {/* Spike barricades */}
    {[
      [8, 14],
      [18, 4],
      [-8, 20],
    ].map(([x, y], i) => (
      <g key={i}>
        <Line a={[x - 6, y, 0]} b={[x + 6, y, 0]} w={2.2} />
        {[-5, -1, 3].map((o) => (
          <Poly key={o} fill={MAT.wood.top} p={[[x + o, y, 0], [x + o + 2, y, 0], [x + o + 1, y + 3, 9]]} />
        ))}
      </g>
    ))}
    {/* Net */}
    <path d={`M ${P(16, -18, 0).x} ${P(16, -18, 0).y} q 8 -12 16 0`} fill="none" stroke={OUTLINE} strokeDasharray="2 2" strokeWidth="1.2" />
    {t >= 2 && <Flag color={banner(t)} x={-10} y={-10} z={22} />}
  </>
);

const hideout: Draw = (t) => (
  <>
    <Plate m={MAT.grass} />
    {/* Grassy mound */}
    <Dome m={MAT.grass} r={20} x={-4} y={-4} z={0} />
    <Tuft x={-12} y={-6} />
    <Tuft x={2} y={-14} />
    {/* Round door */}
    <ellipse cx={P(-2, 14, 6).x} cy={P(-2, 14, 6).y} fill={t === 3 ? MAT.gold.left : MAT.darkWood.left} rx="6" ry="7" stroke={OUTLINE} strokeWidth="1.3" />
    <circle cx={P(-2, 14, 6).x + 2} cy={P(-2, 14, 6).y} fill={MAT.gold.top} r="1" />
    <Box d={2} h={14} m={MAT.darkStone} w={2} x={8} y={-8} z={6} />
    <Smoke x={8} y={-8} z={20} />
    <Tree s={0.8} x={20} y={-16} />
    <Barrel x={18} y={18} />
    {t >= 2 && <Flag color={banner(t)} x={-16} y={-14} z={10} />}
  </>
);

// ─── Civic ───────────────────────────────────────────────────────────────────

const treasury: Draw = (t) => (
  <>
    <Plate m={MAT.cobble} />
    <Box d={6} h={4} m={MAT.stone} w={34} x={0} y={0} />
    <Box d={30} h={20} m={MAT.stone} top={false} w={30} x={0} y={-2} z={0} />
    {[-10, -2, 6].map((u) => (
      <Box key={u} d={2} h={18} m={MAT.plaster} w={3} x={u} y={14} z={0} />
    ))}
    <DoorRight face={15} h={11} u={-2} w={6} />
    <Box d={32} h={3} m={MAT.gold} w={32} x={0} y={-2} z={20} />
    <Cylinder h={6} m={MAT.stone} r={10} x={0} y={-2} z={23} />
    <Dome m={MAT.gold} r={10} x={0} y={-2} z={29} />
    {/* Chest of coins */}
    <Box d={6} h={5} m={MAT.darkWood} w={8} x={20} y={20} />
    <Poly fill={MAT.gold.top} p={[[16, 17, 5.5], [24, 17, 5.5], [24, 23, 5.5], [16, 23, 5.5]]} />
    {t >= 2 && <Flag color={banner(t)} x={0} y={-2} z={42} />}
  </>
);

const academy: Draw = (t) => (
  <>
    <Plate m={MAT.cobble} />
    <Box d={24} h={18} m={MAT.plaster} top={false} w={30} x={-4} y={-4} />
    {[-14, -6, 2].map((u) => (
      <WinLeft key={u} face={8} h={8} u={u} w={4} z={6} />
    ))}
    <Gable d={24} gable={MAT.plaster} h={14} m={roofOf(t, MAT.slate)} ridge="x" w={30} x={-4} y={-4} z={18} />
    {/* Tower with the bell */}
    <Box d={12} h={40} m={MAT.plaster} top={false} w={12} x={16} y={10} />
    <DoorLeft face={16} h={10} u={16} w={6} />
    <circle cx={P(22, 10, 30).x} cy={P(22, 10, 30).y} fill={MAT.cloth.top} r="4" stroke={OUTLINE} strokeWidth="1.1" />
    <Line a={[22, 10, 30]} b={[22, 8, 32]} w={1} />
    <Pyramid d={12} h={18} m={roofOf(t, MAT.slate)} over={2} w={12} x={16} y={10} z={40} />
    {t >= 2 && <Flag color={banner(t)} x={16} y={10} z={58} />}
  </>
);

const embassy: Draw = (t) => (
  <>
    <Plate m={MAT.cobble} />
    <Box d={4} h={3} m={MAT.stone} w={36} x={0} y={12} />
    <Box d={24} h={22} m={MAT.plaster} top={false} w={36} x={0} y={-4} />
    {[-14, -7, 7, 14].map((u) => (
      <Box key={u} d={2.5} h={20} m={MAT.stone} w={2.5} x={u} y={9} z={2} />
    ))}
    <DoorLeft face={8} h={13} u={0} w={7} />
    <Gable d={24} gable={MAT.plaster} h={10} m={roofOf(t)} ridge="x" w={36} x={0} y={-4} z={22} />
    <Flag color={MAT.blueCloth.left} h={14} x={-18} y={12} z={3} />
    <Flag color={MAT.greenRoof.left} h={14} x={18} y={12} z={3} />
    <Flag color={banner(t)} h={14} x={0} y={-4} z={32} />
  </>
);

const hospital: Draw = (t) => (
  <>
    <Plate m={MAT.grass} />
    <Box d={26} h={18} m={MAT.plaster} top={false} w={32} x={-2} y={-6} />
    {[-12, 4].map((u) => (
      <WinLeft key={u} face={7} u={u} z={7} />
    ))}
    <DoorLeft face={7} h={11} u={-4} w={6} />
    {/* Herb sign: a green leaf */}
    <path d={`M ${P(-4, 7, 14).x} ${P(-4, 7, 14).y + 1} q -4 -4 0 -8 q 4 4 0 8 z`} fill={MAT.leaf.left} stroke={OUTLINE} strokeWidth="1" />
    <WinRight face={14} u={-6} z={7} />
    <Gable d={26} gable={MAT.plaster} h={14} m={roofOf(t, MAT.greenRoof)} ridge="x" w={32} x={-2} y={-6} z={18} />
    {/* Herb garden */}
    {[14, 20].map((y) => (
      <Line key={y} a={[-24, y, 0]} b={[-6, y, 0]} color={MAT.leaf.right} w={3.4} />
    ))}
    <Cylinder h={6} m={MAT.stone} r={4} x={18} y={18} />
    <ellipse cx={P(18, 18, 6).x} cy={P(18, 18, 6).y} fill={MAT.water.top} rx="4" ry="2" />
    {t >= 2 && <Flag color={banner(t)} x={-2} y={-6} z={32} />}
  </>
);

const explorationCenter: Draw = (t) => {
  const scope = P(4, 0, 40);

  return (
    <>
      <Plate m={MAT.cobble} />
      <Box d={16} h={10} m={MAT.wood} top={false} w={16} x={-16} y={14} />
      <Gable d={16} gable={MAT.wood} h={8} m={MAT.thatch} ridge="x" w={16} x={-16} y={14} z={10} />
      <Cylinder h={32} m={MAT.stone} r={12} top={false} x={4} y={0} />
      <DoorLeft face={11} h={10} u={4} w={6} />
      <WinRight face={14} u={-2} w={3} z={20} />
      <Cylinder h={2} m={MAT.darkStone} r={13} x={4} y={0} z={32} />
      <Dome m={roofOf(t, MAT.slate)} r={11} x={4} y={0} z={34} />
      {/* Telescope */}
      <line stroke={OUTLINE} strokeLinecap="round" strokeWidth="5" x1={scope.x} x2={scope.x + 16} y1={scope.y - 2} y2={scope.y - 14} />
      <line stroke={MAT.gold.left} strokeLinecap="round" strokeWidth="3" x1={scope.x} x2={scope.x + 16} y1={scope.y - 2} y2={scope.y - 14} />
      {/* Map on a stand */}
      <Box d={2} h={10} m={MAT.darkWood} w={2} x={22} y={22} />
      <Poly fill={MAT.cloth.top} p={[[18, 23, 8], [26, 23, 8], [26, 23, 16], [18, 23, 16]]} />
      <Line a={[20, 23, 10]} b={[24, 23, 14]} color={MAT.redCloth.left} w={1} />
      {t >= 2 && <Flag color={banner(t)} x={-16} y={14} z={18} />}
    </>
  );
};

// ─── Registry ────────────────────────────────────────────────────────────────

export const BUILDING_ART: Record<string, Draw> = {
  "town-hall": townHall,
  "city-gate": cityGate,
  watchtower,
  windmill,
  sawmill,
  "iron-mine": ironMine,
  brickyard,
  "resource-warehouse": warehouse,
  "trading-post": tradingPost,
  "fertilizer-workshop": fertilizerWorkshop,
  barracks,
  stable,
  armory,
  arsenal,
  "siege-workshop": siegeWorkshop,
  "military-command": militaryCommand,
  "war-hall": warHall,
  trapmaker,
  hideout,
  treasury,
  academy,
  embassy,
  hospital,
  "exploration-center": explorationCenter,
};

/** A building picture. Level 0 shows the plan as a pale sketch. */
export const BuildingArt = ({
  id,
  level = 1,
  className,
  title,
}: {
  id: string;
  level?: number;
  className?: string;
  title?: string;
}) => {
  const draw = BUILDING_ART[id];
  const tier = tierFor(level);

  return (
    <Art className={className} title={title}>
      {draw ? (
        tier === 0 ? (
          <g opacity="0.4" style={{ filter: "grayscale(1) sepia(0.4)" }}>
            {draw(1)}
          </g>
        ) : (
          draw(tier)
        )
      ) : null}
    </Art>
  );
};
