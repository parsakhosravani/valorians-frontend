/**
 * Troops, resource nodes for the Daily Mine, and the default avatar.
 * Same rules as the buildings: 128×128 box, three flat tones, one outline.
 */
import React from "react";

import { Art, Box, Dome, Gable, Line, Log, P, Poly, Pine, Tuft } from "./iso";
import { MAT, OUTLINE } from "./palette";

const o = { stroke: OUTLINE, strokeWidth: 1.8, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const SKIN = { light: "#F0C9A0", mid: "#D9A87C" };

const Shadow = ({ rx = 26 }: { rx?: number }) => <ellipse cx="64" cy="114" fill="#000" opacity="0.22" rx={rx} ry="6" />;

/** Chunky little soldier body shared by the foot troops. */
const Body = ({ coat, coatDark, legs = MAT.darkWood.left }: { coat: string; coatDark: string; legs?: string }) => (
  <g>
    <path d="M54 92h8v20h-9z" fill={legs} {...o} />
    <path d="M66 92h8l1 20h-9z" fill={legs} {...o} />
    <path d="M51 112h11v3H50zM66 112h10l1 3H66z" fill={MAT.darkWood.right} {...o} />
    <path d="M46 62c0-6 8-10 18-10s18 4 18 10l3 32H43z" fill={coat} {...o} />
    <path d="M64 52c10 0 18 4 18 10l3 32H64z" fill={coatDark} />
    <path d="M46 62c0-6 8-10 18-10s18 4 18 10l3 32H43z" fill="none" {...o} />
    <path d="M44 84h41" stroke={OUTLINE} strokeWidth="5" />
    <path d="M44 84h41" stroke={MAT.wood.left} strokeWidth="2.6" />
    <rect fill={MAT.gold.left} height="5" rx="1" stroke={OUTLINE} strokeWidth="1.2" width="6" x="61" y="81.5" />
  </g>
);

const Head = ({ helmet = true, hood }: { helmet?: boolean; hood?: string }) => (
  <g>
    <circle cx="64" cy="40" fill={SKIN.light} r="13" {...o} />
    <path d="M64 27a13 13 0 0 1 0 26z" fill={SKIN.mid} opacity="0.6" />
    {/* Beard */}
    <path d="M53 44c2 9 7 12 11 12s9-3 11-12c-3 3-7 4-11 4s-8-1-11-4z" fill="#C46A32" {...o} />
    <circle cx="59.5" cy="40" fill={OUTLINE} r="1.6" />
    <circle cx="68.5" cy="40" fill={OUTLINE} r="1.6" />
    {helmet && (
      <g>
        <path d="M50 38c0-10 6-15 14-15s14 5 14 15z" fill={MAT.iron.top} {...o} />
        <path d="M64 23c8 0 14 5 14 15H64z" fill={MAT.iron.left} />
        <path d="M50 38c0-10 6-15 14-15s14 5 14 15z" fill="none" {...o} />
        <path d="M50 37h28" {...o} strokeWidth={3.4} />
        <path d="M50 37h28" stroke={MAT.gold.left} strokeWidth="1.6" />
        <path d="M62 37h4v8h-4z" fill={MAT.iron.left} {...o} strokeWidth={1.3} />
      </g>
    )}
    {hood && (
      <path d="M48 44c-2-14 6-23 16-23s18 9 16 23l-4-2c0-8-5-13-12-13s-12 5-12 13z" fill={hood} {...o} />
    )}
  </g>
);

const spearman = (
  <>
    <Shadow />
    {/* Spear behind the body */}
    <path d="M88 18v94" stroke={OUTLINE} strokeLinecap="round" strokeWidth="5" />
    <path d="M88 18v94" stroke={MAT.wood.top} strokeLinecap="round" strokeWidth="2.6" />
    <path d="M88 6l5 13h-10z" fill={MAT.iron.top} {...o} />
    <Body coat={MAT.blueCloth.left} coatDark={MAT.blueCloth.right} />
    <Head />
    {/* Hand on the spear */}
    <circle cx="86" cy="70" fill={SKIN.light} r="5" {...o} />
    {/* Round shield */}
    <circle cx="46" cy="76" fill={MAT.redCloth.left} r="17" {...o} />
    <path d="M46 59a17 17 0 0 1 0 34z" fill={MAT.redCloth.right} />
    <circle cx="46" cy="76" fill="none" r="17" {...o} />
    <path d="M46 59v34M29 76h34" stroke={MAT.cloth.left} strokeWidth="3" />
    <circle cx="46" cy="76" fill={MAT.gold.top} r="4.5" {...o} />
  </>
);

const archer = (
  <>
    <Shadow />
    {/* Quiver on the back */}
    <path d="M72 50l14-8 6 22-12 6z" fill={MAT.darkWood.left} {...o} />
    {[0, 4, 8].map((d) => (
      <path key={d} d={`M${76 + d} ${46 - d / 2}l-4 -12`} stroke={MAT.redCloth.left} strokeLinecap="round" strokeWidth="2.4" />
    ))}
    <Body coat={MAT.greenRoof.left} coatDark={MAT.greenRoof.right} />
    <Head helmet={false} hood={MAT.greenRoof.right} />
    {/* Bow */}
    <path d="M38 40c-12 18-12 42 0 60" fill="none" stroke={OUTLINE} strokeLinecap="round" strokeWidth="6" />
    <path d="M38 40c-12 18-12 42 0 60" fill="none" stroke={MAT.wood.top} strokeLinecap="round" strokeWidth="3.4" />
    <path d="M38 40v60" stroke={MAT.cloth.top} strokeWidth="1.2" />
    <path d="M38 70h22" stroke={OUTLINE} strokeLinecap="round" strokeWidth="1.6" />
    <path d="M60 70l-5-3v6z" fill={MAT.iron.top} {...o} strokeWidth={1.1} />
    <circle cx="38" cy="70" fill={SKIN.light} r="5" {...o} />
  </>
);

const cavalry = (
  <>
    <Shadow rx={44} />
    {/* Horse */}
    <path d="M30 86l-2 26h7l3-22M86 86l2 26h7l-1-24" fill="#6A4229" {...o} />
    <path d="M42 88l-1 24h7l2-22M74 88l1 24h7l-1-24" fill="#83553A" {...o} />
    <path d="M26 72c0-12 14-18 34-18h22c12 0 18 8 18 18v6c0 10-8 14-18 14H42c-10 0-16-6-16-14z" fill="#9A6644" {...o} />
    <path d="M60 54h22c12 0 18 8 18 18v6c0 10-8 14-18 14H60z" fill="#83553A" />
    <path d="M26 72c0-12 14-18 34-18h22c12 0 18 8 18 18v6c0 10-8 14-18 14H42c-10 0-16-6-16-14z" fill="none" {...o} />
    {/* Neck and head */}
    <path d="M90 62l8-24c2-6 10-8 14-2l8 12c2 4-1 7-5 6l-9-3-6 16z" fill="#9A6644" {...o} />
    <path d="M100 30l2-8 5 7" fill="#83553A" {...o} />
    <circle cx="108" cy="38" fill={OUTLINE} r="1.6" />
    <path d="M90 40c4-10 8-14 12-14" fill="none" stroke="#3A2416" strokeLinecap="round" strokeWidth="5" />
    <path d="M27 66c-8 2-12 10-10 20" fill="none" stroke="#3A2416" strokeLinecap="round" strokeWidth="5" />
    {/* Saddle cloth */}
    <path d="M46 56h28l-2 26H48z" fill={MAT.redCloth.left} {...o} />
    <path d="M48 76h24" stroke={MAT.gold.left} strokeWidth="2.4" />
    {/* Rider */}
    <path d="M52 34c0-5 5-8 12-8s12 3 12 8l2 24H50z" fill={MAT.blueCloth.left} {...o} />
    <path d="M58 56l-2 18h8l1-18z" fill={MAT.darkWood.left} {...o} />
    <g>
      <circle cx="64" cy="22" fill={SKIN.light} r="10" {...o} />
      <path d="M54 22c0-8 4-12 10-12s10 4 10 12z" fill={MAT.iron.top} {...o} />
      <path d="M54 21h20" {...o} strokeWidth={3} />
      <path d="M54 21h20" stroke={MAT.gold.left} strokeWidth="1.4" />
      <path d="M57 25c2 6 4 8 7 8s5-2 7-8c-2 2-4 3-7 3s-5-1-7-3z" fill="#C46A32" {...o} strokeWidth={1.3} />
    </g>
    {/* Lance */}
    <path d="M40 60L112 8" stroke={OUTLINE} strokeLinecap="round" strokeWidth="5" />
    <path d="M40 60L112 8" stroke={MAT.wood.top} strokeLinecap="round" strokeWidth="2.6" />
    <path d="M110 4l8-2-4 8z" fill={MAT.iron.top} {...o} />
    <path d="M96 20l10-2-6 8z" fill={MAT.redCloth.left} {...o} strokeWidth={1.2} />
  </>
);

const ram = (
  <g transform="translate(0 8)">
    <Shadow rx={44} />
    {/* Frame and roof */}
    <Box d={20} h={4} m={MAT.wood} w={46} x={0} y={0} z={6} />
    {[
      [-20, -8],
      [20, -8],
      [-20, 8],
      [20, 8],
    ].map(([x, y], i) => (
      <Box key={i} d={3} h={18} m={MAT.darkWood} w={3} x={x} y={y} z={10} />
    ))}
    <Log len={72} r={4} x={14} y={0} z={14} />
    <Box d={10} h={10} m={MAT.iron} w={6} x={52} y={0} z={12} />
    <Gable d={20} h={12} m={MAT.redCloth} over={3} ridge="x" w={46} x={0} y={0} z={28} />
    {[
      [-16, 12],
      [16, 12],
    ].map(([x, y], i) => {
      const c = P(x, y, 5);

      return (
        <g key={i}>
          <circle cx={c.x} cy={c.y} fill={MAT.darkWood.left} r="7" stroke={OUTLINE} strokeWidth="1.6" />
          <circle cx={c.x} cy={c.y} fill={MAT.iron.top} r="2" />
        </g>
      );
    })}
  </g>
);

export const TROOP_ART: Record<string, React.ReactNode> = { spearman, archer, cavalry, ram };

export const TroopArt = ({ id, className, title }: { id: string; className?: string; title?: string }) => (
  <svg
    aria-hidden={title ? undefined : true}
    className={className}
    overflow="visible"
    role={title ? "img" : undefined}
    viewBox="0 0 128 128"
  >
    {title && <title>{title}</title>}
    {TROOP_ART[id]}
  </svg>
);

// ─── Resource nodes (what you strike in the Daily Mine) ──────────────────────

const ironNode = (
  <>
    <Poly fill={MAT.rock.left} p={[[-30, 18, 0], [16, 18, 0], [8, 2, 30], [-14, -4, 34]]} />
    <Poly fill={MAT.rock.right} p={[[16, -26, 0], [16, 18, 0], [8, 2, 30], [0, -16, 36]]} />
    <Poly fill={MAT.rock.top} p={[[-14, -4, 34], [8, 2, 30], [0, -16, 36], [-12, -18, 38]]} />
    <Poly fill={MAT.darkStone.left} p={[[-22, 18, 4], [-12, 18, 4], [-14, 18, 16]]} />
    <Poly fill={MAT.iron.top} p={[[-6, 18, 10], [2, 18, 10], [-1, 18, 20]]} />
    <Poly fill={MAT.iron.right} p={[[16, -6, 8], [16, 4, 8], [16, 0, 18]]} />
    <Poly fill={MAT.iron.top} p={[[-8, -10, 35.5], [-2, -8, 35]]} />
    {/* Fallen ore */}
    <Box d={6} h={4} m={MAT.iron} w={8} x={22} y={18} />
    <Box d={5} h={3} m={MAT.darkStone} w={6} x={-26} y={26} />
    <Box d={4} h={3} m={MAT.iron} w={5} x={8} y={26} />
  </>
);

const woodNode = (
  <>
    <Pine s={1.2} x={-24} y={-22} />
    {/* Stump */}
    <Poly fill={MAT.wood.left} p={[[-14, 12, 0], [12, 12, 0], [12, 12, 20], [-14, 12, 20]]} />
    <Poly fill={MAT.wood.right} p={[[12, -14, 0], [12, 12, 0], [12, 12, 20], [12, -14, 20]]} />
    <Poly fill="#E8C189" p={[[-14, -14, 20], [12, -14, 20], [12, 12, 20], [-14, 12, 20]]} />
    {[0.3, 0.55, 0.8].map((k) => (
      <Poly key={k} fill="none" p={[[-1 - 13 * k, -1 - 13 * k, 20], [-1 + 13 * k, -1 - 13 * k, 20], [-1 + 13 * k, -1 + 13 * k, 20], [-1 - 13 * k, -1 + 13 * k, 20]]} />
    ))}
    {/* Axe stuck in the top */}
    <Line a={[2, 0, 20]} b={[16, 12, 40]} color={OUTLINE} w={5} />
    <Line a={[2, 0, 20]} b={[16, 12, 40]} color={MAT.wood.top} w={2.6} />
    <Poly fill={MAT.iron.top} p={[[-4, -6, 18], [6, 4, 18], [4, 2, 28], [-6, -4, 26]]} />
    {/* Split logs */}
    <Log len={22} x={6} y={26} />
    <Log len={18} x={22} y={20} />
    <Log len={20} x={14} y={23} z={4} />
    <Tuft x={-22} y={20} />
  </>
);

const clayNode = (
  <>
    <Dome m={{ top: "#D98B61", left: "#BC6B44", right: "#954F31" }} r={26} x={-4} y={-4} z={0} />
    <Poly fill="#A85A38" outline={false} p={[[-10, -6, 18], [0, -8, 20], [-4, 0, 16]]} />
    {/* Spade */}
    <Line a={[6, -10, 10]} b={[10, -16, 46]} color={OUTLINE} w={5} />
    <Line a={[6, -10, 10]} b={[10, -16, 46]} color={MAT.wood.top} w={2.6} />
    <Poly fill={MAT.iron.top} p={[[2, -8, 4], [10, -12, 4], [9, -12, 14], [3, -8, 14]]} />
    {/* Bricks */}
    <Box d={6} h={5} m={MAT.brick} w={10} x={20} y={22} />
    <Box d={6} h={5} m={MAT.brick} w={10} x={20} y={22} z={5} />
    <Box d={6} h={5} m={MAT.brick} w={10} x={8} y={28} />
  </>
);

const cropNode = (
  <>
    {/* Sheaves leaning together */}
    {[
      [-16, -10],
      [0, -14],
      [-6, 6],
      [12, 0],
    ].map(([x, y], i) => {
      const b = P(x, y, 0);

      return (
        <g key={i}>
          <path d={`M ${b.x - 8} ${b.y} L ${b.x - 2} ${b.y - 30} L ${b.x + 2} ${b.y - 30} L ${b.x + 8} ${b.y} Z`} fill={i % 2 ? MAT.crop.left : MAT.crop.top} {...o} strokeWidth={1.4} />
          <path d={`M ${b.x - 4} ${b.y - 18} h 8`} stroke={MAT.wood.left} strokeWidth="2.6" />
          <ellipse cx={b.x} cy={b.y - 34} fill={MAT.hay.top} rx="7" ry="6" {...o} strokeWidth={1.4} />
          {[-4, 0, 4].map((d) => (
            <path key={d} d={`M ${b.x + d} ${b.y - 38} l ${d / 2} -6`} stroke={MAT.crop.right} strokeLinecap="round" strokeWidth="1.6" />
          ))}
        </g>
      );
    })}
    {/* Basket of grain */}
    <Poly fill={MAT.wood.left} p={[[16, 24, 0], [30, 24, 0], [32, 26, 10], [14, 26, 10]]} />
    <Poly fill={MAT.crop.top} p={[[14, 18, 10], [30, 18, 10], [32, 26, 10], [14, 26, 10]]} />
  </>
);

const NODES: Record<string, React.ReactNode> = { iron: ironNode, wood: woodNode, clay: clayNode, crop: cropNode };

/** Big strike target in the Daily Mine. */
export const ResourceNode = ({ id, className }: { id: string; className?: string }) => (
  <Art className={className}>
    <ellipse cx="66" cy="104" fill="#000" opacity="0.25" rx="46" ry="12" />
    {NODES[id]}
  </Art>
);

// ─── Default avatar ──────────────────────────────────────────────────────────

/** Player portrait for anyone without a Telegram photo. Seeded colour. */
export const AvatarArt = ({ seed = 0, className }: { seed?: number; className?: string }) => {
  const bgs = ["#5785B0", "#C94B32", "#6C8E5B", "#A87A47", "#7C6AA8"];
  const bg = bgs[Math.abs(seed) % bgs.length];

  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 64 64">
      <rect fill={bg} height="64" width="64" />
      <circle cx="32" cy="70" fill="#000" opacity="0.15" r="30" />
      <path d="M12 64c0-12 9-19 20-19s20 7 20 19z" fill={MAT.darkWood.left} {...o} />
      <circle cx="32" cy="32" fill={SKIN.light} r="13" {...o} />
      <path d="M20 35c2 10 7 14 12 14s10-4 12-14c-3 3-7 4-12 4s-9-1-12-4z" fill="#C46A32" {...o} />
      <path d="M18 30c0-11 6-17 14-17s14 6 14 17z" fill={MAT.iron.top} {...o} />
      <path d="M32 13c8 0 14 6 14 17H32z" fill={MAT.iron.left} />
      <path d="M18 30c0-11 6-17 14-17s14 6 14 17z" fill="none" {...o} />
      <path d="M18 29h28" {...o} strokeWidth={3} />
      <path d="M18 29h28" stroke={MAT.gold.left} strokeWidth="1.4" />
      <path d="M18 24c-6-2-8-8-6-13 3 3 6 5 8 8M46 24c6-2 8-8 6-13-3 3-6 5-8 8" fill={MAT.cloth.top} {...o} strokeWidth={1.4} />
      <circle cx="27" cy="33" fill={OUTLINE} r="1.4" />
      <circle cx="37" cy="33" fill={OUTLINE} r="1.4" />
    </svg>
  );
};
