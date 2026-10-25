import { useId } from "react";

import { PAINTED_TROOPS, UnitId } from "@/lib/game/config";

/**
 * Troop portraits: a painted-style bust of each troop type inside a medal
 * frame whose metal shows the regiment's rank, with one chevron per rank.
 * If a painted image is added to /public/images/troops/<id>.webp and the id
 * is listed in PAINTED_TROOPS, it is used instead of the drawn bust.
 */

/** Frame metal per rank: Recruit, Soldier, Veteran, Elite, Champion, Legend. */
export const RANK_METAL = [
  { light: "#B08A63", mid: "#7A5B3E", dark: "#3E2C1D", label: "#C8A57D" },
  { light: "#E9B27A", mid: "#A8682F", dark: "#4E2C10", label: "#E6A86A" },
  { light: "#F4F6F8", mid: "#A9B1BB", dark: "#4B525C", label: "#D4DAE2" },
  { light: "#FFE7A3", mid: "#E3A948", dark: "#7A4F12", label: "#F2C66D" },
  { light: "#FFC58F", mid: "#E8612C", dark: "#6E1E08", label: "#F59A6B" },
  { light: "#F1E2FF", mid: "#B58CFF", dark: "#3E2275", label: "#CDB1FF" },
];

type Ids = (k: string) => string;

const Spearman = ({ id }: { id: Ids }) => (
  <g>
    <defs>
      <linearGradient id={id("steel")} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#E8EDF2" />
        <stop offset="0.45" stopColor="#9AA4AE" />
        <stop offset="1" stopColor="#3F4750" />
      </linearGradient>
      <radialGradient cx="0.45" cy="0.35" id={id("skin")} r="0.7">
        <stop offset="0" stopColor="#F2C29B" />
        <stop offset="1" stopColor="#B87754" />
      </radialGradient>
      <linearGradient id={id("beard")} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#8A4F25" />
        <stop offset="1" stopColor="#4A2610" />
      </linearGradient>
      <radialGradient cx="0.4" cy="0.35" id={id("shield")} r="0.75">
        <stop offset="0" stopColor="#C9483A" />
        <stop offset="1" stopColor="#6B1B14" />
      </radialGradient>
      <linearGradient id={id("fur")} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#D9BE95" />
        <stop offset="1" stopColor="#8C6A44" />
      </linearGradient>
    </defs>
    {/* spear behind */}
    <line stroke="#5A3A1E" strokeLinecap="round" strokeWidth="3.2" x1="78" x2="64" y1="104" y2="14" />
    <path d="M62.6 5 L67.5 17 L64.4 21 L60.4 18 Z" fill={`url(#${id("steel")})`} stroke="#2B2F35" strokeWidth="0.6" />
    {/* body */}
    <path d="M14 104 C16 80 30 70 50 70 C70 70 84 80 86 104 Z" fill="#5B3A22" />
    <path d="M22 104 C24 86 34 78 50 78 C66 78 76 86 78 104 Z" fill="#7A4E2C" opacity="0.6" />
    {/* fur collar */}
    <path
      d="M22 80 C28 68 40 66 50 70 C60 66 72 68 78 80 C70 84 62 78 50 82 C38 78 30 84 22 80 Z"
      fill={`url(#${id("fur")})`}
    />
    {/* face */}
    <ellipse cx="50" cy="50" fill={`url(#${id("skin")})`} rx="14" ry="16" />
    {/* beard */}
    <path
      d="M36 50 C36 62 42 74 50 76 C58 74 64 62 64 50 C60 56 56 58 50 58 C44 58 40 56 36 50 Z"
      fill={`url(#${id("beard")})`}
    />
    <path d="M43 58 C46 60 54 60 57 58" fill="none" stroke="#3A1C0A" strokeLinecap="round" strokeWidth="1.2" />
    {/* eyes */}
    <path d="M42 47 h5" stroke="#2A1A10" strokeLinecap="round" strokeWidth="1.8" />
    <path d="M53 47 h5" stroke="#2A1A10" strokeLinecap="round" strokeWidth="1.8" />
    {/* helmet */}
    <path
      d="M34 44 C34 28 42 20 50 18 C58 20 66 28 66 44 C60 41 56 40 50 40 C44 40 40 41 34 44 Z"
      fill={`url(#${id("steel")})`}
      stroke="#2B2F35"
      strokeWidth="0.8"
    />
    <path d="M50 18 L50 40" stroke="#4B535C" strokeWidth="1.4" />
    <path d="M33.5 44 C40 40.5 60 40.5 66.5 44" fill="none" stroke="#C7A24E" strokeWidth="2.4" />
    <rect fill={`url(#${id("steel")})`} height="13" rx="1.2" stroke="#2B2F35" strokeWidth="0.6" width="4" x="48" y="41" />
    <path d="M42 24 C45 21 48 20 50 20" fill="none" opacity="0.8" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="1.4" />
    {/* round shield */}
    <g transform="translate(26 88)">
      <circle fill={`url(#${id("shield")})`} r="20" stroke="#3A2614" strokeWidth="2.4" />
      <path d="M-20 0 H20 M0 -20 V20" stroke="#E7C680" strokeWidth="3" opacity="0.85" />
      <circle r="20" fill="none" stroke="#C9CED6" strokeWidth="1.2" opacity="0.6" />
      <circle fill={`url(#${id("steel")})`} r="5.5" stroke="#2B2F35" strokeWidth="0.6" />
      <circle cx="-1.5" cy="-1.8" fill="#FFFFFF" opacity="0.7" r="1.4" />
    </g>
  </g>
);

const Archer = ({ id }: { id: Ids }) => (
  <g>
    <defs>
      <linearGradient id={id("hood")} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#6E8A4A" />
        <stop offset="1" stopColor="#25331A" />
      </linearGradient>
      <radialGradient cx="0.5" cy="0.4" id={id("skin")} r="0.7">
        <stop offset="0" stopColor="#E9B48C" />
        <stop offset="1" stopColor="#8E5638" />
      </radialGradient>
      <linearGradient id={id("bow")} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#B07A3E" />
        <stop offset="1" stopColor="#5C3714" />
      </linearGradient>
    </defs>
    {/* quiver over shoulder */}
    <g transform="rotate(-24 72 50)">
      <rect fill="#6A3E1C" height="36" rx="4" stroke="#3A210C" strokeWidth="1" width="11" x="66" y="34" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${68 + i * 2.4} 18)`}>
          <line stroke="#C9A26B" strokeWidth="1" x1="0.6" x2="0.6" y1="4" y2="18" />
          <path d="M0 0 L1.2 0 L2.6 6 L-1.4 6 Z" fill={i % 2 ? "#E8E2D2" : "#C9483A"} />
        </g>
      ))}
    </g>
    {/* cloak */}
    <path d="M12 104 C14 78 30 66 50 66 C70 66 86 78 88 104 Z" fill={`url(#${id("hood")})`} />
    <path d="M30 104 C32 88 40 80 50 80 C60 80 68 88 70 104 Z" fill="#4A3220" />
    <path d="M40 80 L50 92 L60 80" fill="none" stroke="#B28A4E" strokeWidth="1.6" />
    {/* hood */}
    <path
      d="M28 66 C26 40 36 20 50 18 C64 20 74 40 72 66 C66 70 60 72 50 72 C40 72 34 70 28 66 Z"
      fill={`url(#${id("hood")})`}
      stroke="#1C2613"
      strokeWidth="0.8"
    />
    {/* face in hood shadow */}
    <ellipse cx="50" cy="50" fill="#120D09" opacity="0.55" rx="15" ry="18" />
    <path d="M38 46 C38 34 44 30 50 30 C56 30 62 34 62 46 C62 60 56 68 50 68 C44 68 38 60 38 46 Z" fill={`url(#${id("skin")})`} />
    <path d="M38 40 C42 34 58 34 62 40 C58 38 42 38 38 40 Z" fill="#1E2814" opacity="0.8" />
    <path d="M42.5 47 h5" stroke="#1A100A" strokeLinecap="round" strokeWidth="1.8" />
    <path d="M52.5 47 h5" stroke="#1A100A" strokeLinecap="round" strokeWidth="1.8" />
    <path d="M45 60 C48 61.5 52 61.5 55 60" fill="none" stroke="#6B3A22" strokeLinecap="round" strokeWidth="1.2" />
    <path d="M36 44 C36 30 44 22 50 22" fill="none" opacity="0.35" stroke="#D7E8B0" strokeLinecap="round" strokeWidth="1.6" />
    {/* bow in front */}
    <path d="M20 22 C4 52 6 80 22 104" fill="none" stroke={`url(#${id("bow")})`} strokeLinecap="round" strokeWidth="4" />
    <line stroke="#EFE3CC" strokeWidth="0.8" x1="20" x2="22" y1="22" y2="104" />
    <rect fill="#3A210C" height="8" rx="1.5" width="6" x="7.5" y="58" />
  </g>
);

const Cavalry = ({ id }: { id: Ids }) => (
  <g>
    <defs>
      <linearGradient id={id("horse")} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#8A5530" />
        <stop offset="1" stopColor="#3A1F0E" />
      </linearGradient>
      <linearGradient id={id("steel")} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#F2F5F8" />
        <stop offset="0.5" stopColor="#9AA4AE" />
        <stop offset="1" stopColor="#3F4750" />
      </linearGradient>
      <linearGradient id={id("cloth")} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#2F5E9E" />
        <stop offset="1" stopColor="#152C4E" />
      </linearGradient>
    </defs>
    {/* lance with pennant */}
    <line stroke="#6A4322" strokeLinecap="round" strokeWidth="2.6" x1="20" x2="86" y1="104" y2="8" />
    <path d="M86 8 L80 14 L92 4 Z" fill={`url(#${id("steel")})`} />
    <path d="M78 18 C70 16 66 22 58 20 L62 28 C70 30 72 24 80 26 Z" fill="#C9483A" />
    {/* rider behind */}
    <path d="M14 104 C14 84 22 72 34 70 C46 72 50 84 50 104 Z" fill={`url(#${id("cloth")})`} />
    <path
      d="M22 52 C22 40 28 34 34 34 C40 34 46 40 46 52 L46 62 C42 66 26 66 22 62 Z"
      fill={`url(#${id("steel")})`}
      stroke="#2B2F35"
      strokeWidth="0.8"
    />
    <rect fill="#120D09" height="3" rx="1" width="18" x="25" y="50" />
    <path d="M34 34 C30 26 34 18 42 16 C38 22 40 28 36 34 Z" fill="#C9483A" />
    <path d="M26 44 C27 39 30 36 34 36" fill="none" opacity="0.8" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="1.3" />
    {/* horse head */}
    <path
      d="M40 104 C40 86 44 70 52 58 C56 50 58 40 62 32 C64 28 70 26 74 30 C80 36 88 52 92 64 C94 70 90 74 86 72 C80 70 76 66 72 66 C70 76 72 92 76 104 Z"
      fill={`url(#${id("horse")})`}
      stroke="#24130A"
      strokeWidth="0.8"
    />
    {/* mane */}
    <path d="M60 34 C54 44 48 52 44 66 C42 78 40 90 40 104 L46 104 C46 86 50 70 58 54 Z" fill="#1E120A" />
    {/* ear */}
    <path d="M64 30 L62 18 L70 28 Z" fill="#5C3418" />
    {/* armored chanfron */}
    <path d="M70 32 C76 38 84 50 88 62 L84 64 C80 54 74 44 68 38 Z" fill={`url(#${id("steel")})`} stroke="#2B2F35" strokeWidth="0.6" />
    <circle cx="70" cy="44" fill="#120D09" r="2.4" />
    <circle cx="69.3" cy="43.2" fill="#FFFFFF" opacity="0.8" r="0.7" />
    <circle cx="86.5" cy="68" fill="#120D09" r="1.4" />
    {/* bridle */}
    <path d="M62 42 L80 68 M66 58 L84 66" fill="none" stroke="#C7A24E" strokeWidth="1.6" />
    {/* caparison */}
    <path d="M42 90 C52 86 64 88 76 94 L78 104 L40 104 Z" fill={`url(#${id("cloth")})`} />
    <path d="M42 92 C52 88 64 90 76 96" fill="none" stroke="#E3A948" strokeWidth="1.6" />
  </g>
);

const Ram = ({ id }: { id: Ids }) => (
  <g>
    <defs>
      <linearGradient id={id("wood")} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#B07A3E" />
        <stop offset="1" stopColor="#4E2E12" />
      </linearGradient>
      <linearGradient id={id("roof")} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#8C6A44" />
        <stop offset="1" stopColor="#3E2A16" />
      </linearGradient>
      <linearGradient id={id("iron")} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#C9CED6" />
        <stop offset="0.5" stopColor="#6B737C" />
        <stop offset="1" stopColor="#2B2F35" />
      </linearGradient>
    </defs>
    {/* roof frame */}
    <path d="M14 56 L44 26 L70 26 L92 56 Z" fill={`url(#${id("roof")})`} stroke="#2A1A0C" strokeWidth="1" />
    {[0, 1, 2, 3, 4].map((i) => (
      <path key={i} d={`M${20 + i * 15} 56 L${46 + i * 6} 27`} stroke="#2A1A0C" strokeWidth="0.8" opacity="0.6" />
    ))}
    <path d="M18 52 L88 52" stroke="#D7B98A" strokeWidth="1" opacity="0.4" />
    {/* posts */}
    <rect fill="#4E2E12" height="30" width="5" x="22" y="54" />
    <rect fill="#4E2E12" height="30" width="5" x="78" y="54" />
    {/* hanging chains */}
    <path d="M40 54 L42 66 M66 54 L64 66" stroke="#3F4750" strokeDasharray="2 1.4" strokeWidth="1.6" />
    {/* the log */}
    <rect fill={`url(#${id("wood")})`} height="13" rx="6" stroke="#2A1A0C" strokeWidth="0.8" width="74" x="6" y="64" />
    <path d="M14 67 C30 66 50 66 72 67" fill="none" opacity="0.45" stroke="#F1D7A8" strokeLinecap="round" strokeWidth="1.2" />
    {[24, 46, 66].map((x) => (
      <rect key={x} fill={`url(#${id("iron")})`} height="15" rx="1" width="3.5" x={x} y="63" />
    ))}
    {/* iron ram head */}
    <path d="M78 62 L94 66 C98 68 98 74 94 76 L78 79 Z" fill={`url(#${id("iron")})`} stroke="#1E2228" strokeWidth="0.8" />
    <path d="M90 66 C96 58 92 52 86 56" fill="none" stroke="#6B737C" strokeLinecap="round" strokeWidth="3" />
    <circle cx="88" cy="70" fill="#120D09" r="1.4" />
    {/* base and wheels */}
    <rect fill="#5B3A22" height="6" rx="2" width="80" x="14" y="82" />
    {[26, 50, 80].map((cx) => (
      <g key={cx} transform={`translate(${cx} 92)`}>
        <circle fill="#3A2412" r="9" stroke="#1E120A" strokeWidth="1" />
        <circle fill="none" r="6.2" stroke="#7A5232" strokeWidth="1.4" />
        <path d="M-6 0 H6 M0 -6 V6 M-4.3 -4.3 L4.3 4.3 M-4.3 4.3 L4.3 -4.3" stroke="#7A5232" strokeWidth="1" />
        <circle fill={`url(#${id("iron")})`} r="2" />
      </g>
    ))}
  </g>
);

const BUSTS: Record<UnitId, (p: { id: Ids }) => JSX.Element> = {
  spearman: Spearman,
  archer: Archer,
  cavalry: Cavalry,
  ram: Ram,
};

/** Nudges each bust so it sits well inside the round frame. */
const BUST_FIT: Record<UnitId, string> = {
  spearman: "translate(4 2) scale(0.94)",
  archer: "translate(3 2) scale(0.95)",
  cavalry: "translate(2 4) scale(0.96)",
  ram: "translate(9 10) scale(0.82)",
};

/** Scene behind each troop: dusk sky colors. */
const SKY: Record<UnitId, [string, string]> = {
  spearman: ["#4B6A86", "#E8A15C"],
  archer: ["#3D5A3A", "#D9B46A"],
  cavalry: ["#36507A", "#E3A07A"],
  ram: ["#5A3A2A", "#E8612C"],
};

export const TroopPortrait = ({
  unit,
  size = 56,
  rank = 0,
  framed = true,
  className,
}: {
  unit: UnitId;
  size?: number;
  /** 0 = Recruit … 5 = Legend. Sets the frame metal and chevrons. */
  rank?: number;
  /** false draws the bust only (for small inline icons). */
  framed?: boolean;
  className?: string;
}) => {
  const uid = useId().replace(/:/g, "");
  const id: Ids = (k) => `${uid}-${k}`;
  const metal = RANK_METAL[Math.max(0, Math.min(RANK_METAL.length - 1, rank))];
  const Bust = BUSTS[unit];
  const [skyTop, skyBottom] = SKY[unit];
  const painted = PAINTED_TROOPS.includes(unit);

  return (
    <svg className={className} height={size} role="img" viewBox="0 0 100 100" width={size}>
      <title>{unit}</title>
      <defs>
        <clipPath id={id("clip")}>
          <circle cx="50" cy="50" r={framed ? 43 : 50} />
        </clipPath>
        <linearGradient id={id("sky")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={skyTop} />
          <stop offset="1" stopColor={skyBottom} />
        </linearGradient>
        <radialGradient cx="0.5" cy="0.45" id={id("vignette")} r="0.6">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
        <linearGradient id={id("metal")} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor={metal.light} />
          <stop offset="0.5" stopColor={metal.mid} />
          <stop offset="1" stopColor={metal.dark} />
        </linearGradient>
        <filter height="140%" id={id("glow")} width="140%" x="-20%" y="-20%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>

      {framed && rank >= 4 && (
        <circle cx="50" cy="50" fill={metal.mid} filter={`url(#${id("glow")})`} opacity="0.7" r="48" />
      )}
      {framed && <circle cx="50" cy="50" fill={`url(#${id("metal")})`} r="49" />}

      <g clipPath={`url(#${id("clip")})`}>
        <rect fill={`url(#${id("sky")})`} height="100" width="100" />
        {/* distant hills and mist */}
        <path d="M0 70 C20 60 30 66 46 58 C62 50 78 62 100 54 L100 100 L0 100 Z" fill="#1E1610" opacity="0.45" />
        <path d="M0 80 C24 74 50 82 100 72 L100 100 L0 100 Z" fill="#120D09" opacity="0.5" />
        {painted ? (
          // eslint-disable-next-line @next/next/no-img-element
          <image height="100" href={`/images/troops/${unit}.webp`} preserveAspectRatio="xMidYMid slice" width="100" />
        ) : (
          <g transform={BUST_FIT[unit]}>
            <Bust id={id} />
          </g>
        )}
        <rect fill={`url(#${id("vignette")})`} height="100" width="100" />
      </g>

      {framed && (
        <>
          <circle cx="50" cy="50" fill="none" r="43.5" stroke={metal.dark} strokeWidth="1.4" />
          <path d="M14 30 A40 40 0 0 1 50 7" fill="none" opacity="0.7" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="1.4" />
          {/* rank chevrons on a little plate at the bottom */}
          {rank > 0 && (
            <g transform="translate(50 92)">
              <rect fill={`url(#${id("metal")})`} height="12" rx="6" stroke={metal.dark} strokeWidth="1" width={10 + rank * 7} x={-(10 + rank * 7) / 2} y="-6" />
              {Array.from({ length: rank }, (_, i) => (
                <path
                  key={i}
                  d={`M${-((rank - 1) * 7) / 2 + i * 7 - 3} -2 L${-((rank - 1) * 7) / 2 + i * 7} 2 L${-((rank - 1) * 7) / 2 + i * 7 + 3} -2`}
                  fill="none"
                  stroke={metal.dark}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              ))}
            </g>
          )}
        </>
      )}
    </svg>
  );
};
