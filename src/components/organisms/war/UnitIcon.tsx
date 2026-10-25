import { UnitId } from "@/lib/game/config";

/**
 * Small flat soldier icons in the style of classic browser strategy games:
 * one full figure per troop type, dark outline, a few flat colors.
 * Drawn on a 40×40 grid; scale with `size`.
 */

const O = "#2A1A0C"; // outline
const SKIN = "#E8B48A";
const IRON = "#B9C2CB";
const IRON_D = "#6B737C";
const WOOD = "#9A6532";
const WOOD_D = "#5C3714";
const LEATHER = "#7A4A22";
const GOLD = "#E3A948";

const line = { stroke: O, strokeWidth: 1.2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** Legs, boots, tunic and head of a standing soldier (center x = 18). */
const Footman = ({ tunic, trousers = "#5B4632" }: { tunic: string; trousers?: string }) => (
  <g {...line}>
    <path d="M15 29 h2.8 v7 h-2.8 Z M19.2 29 h2.8 v7 h-2.8 Z" fill={trousers} />
    <path d="M14.4 35.4 h3.8 v2 h-4.4 Z M18.8 35.4 h3.8 l0.6 2 h-4.4 Z" fill={O} />
    <path d="M13 18.5 Q18 15.5 23 18.5 L24.2 30.5 L11.8 30.5 Z" fill={tunic} />
    <path d="M12.6 26 h11.2" fill="none" stroke={LEATHER} strokeWidth="1.6" />
    <circle cx="18" cy="12" fill={SKIN} r="4.2" />
  </g>
);

const ConicalHelmet = () => (
  <g {...line}>
    <path d="M13.4 12.4 Q13.6 6.4 18 4.4 Q22.4 6.4 22.6 12.4 Z" fill={IRON} />
    <path d="M17.3 12 h1.4 v4 h-1.4 Z" fill={IRON} />
    <path d="M15 7.6 Q16 6 18 5.4" fill="none" stroke="#FFFFFF" strokeWidth="0.9" />
  </g>
);

const Spearman = () => (
  <g>
    {/* spear */}
    <g {...line}>
      <path d="M27.4 6 V38" stroke={WOOD_D} strokeWidth="1.8" />
      <path d="M27.4 1.2 L29.4 6.6 L25.4 6.6 Z" fill={IRON} />
    </g>
    <Footman tunic="#B8352A" />
    <ConicalHelmet />
    {/* arm holding the spear */}
    <path d="M22.4 19.5 L26.6 22.5" {...line} fill="none" stroke={O} strokeWidth="2.6" />
    <circle cx="27" cy="22.6" fill={SKIN} r="1.4" {...line} />
    {/* round shield */}
    <g {...line}>
      <circle cx="11.6" cy="24" fill="#2F5E9E" r="6.6" />
      <path d="M5 24 h13.2 M11.6 17.4 v13.2" stroke={GOLD} strokeWidth="1.1" />
      <circle cx="11.6" cy="24" fill={IRON} r="1.8" />
    </g>
  </g>
);

const Swordsman = () => (
  <g>
    <Footman tunic="#6B737C" trousers="#3E3A36" />
    {/* chainmail rings */}
    <path d="M14 21 h8 M13.6 23.5 h8.8" fill="none" opacity="0.5" stroke={O} strokeDasharray="1 1" strokeWidth="0.8" />
    {/* round iron helmet with cheek guards */}
    <g {...line}>
      <path d="M13.4 12.6 Q13.4 6 18 6 Q22.6 6 22.6 12.6 L21.4 15 L21 11.6 L15 11.6 L14.6 15 Z" fill={IRON} />
      <path d="M13 11.6 h10" stroke={IRON_D} strokeWidth="1.4" />
    </g>
    {/* raised sword */}
    <g {...line}>
      <path d="M26 21 L31.6 6.4 L33 7 L27.6 21.6 Z" fill={IRON} />
      <path d="M24.4 20.2 L29.2 22.4" stroke={GOLD} strokeWidth="1.8" />
      <path d="M22.4 19.5 L26.4 21.6" fill="none" stroke={O} strokeWidth="2.6" />
    </g>
    {/* kite shield */}
    <g {...line}>
      <path d="M6.4 18 Q11 16.4 15.6 18 Q15.6 27 11 33 Q6.4 27 6.4 18 Z" fill="#B8352A" />
      <path d="M11 17.4 V32 M7 21.5 h8" stroke={GOLD} strokeWidth="1" />
    </g>
  </g>
);

const Archer = () => (
  <g>
    {/* quiver */}
    <g {...line}>
      <path d="M21 9.6 L25.4 8.4 L27.4 20 L23.4 21 Z" fill={LEATHER} />
      <path d="M22 9 L21.2 5.6 M23.6 8.6 L23.4 5 M25 8.2 L25.6 4.8" stroke="#E8E2D2" strokeWidth="1.1" />
    </g>
    <Footman tunic="#4E6B2E" trousers="#4A3B26" />
    {/* hood */}
    <g {...line}>
      <path d="M13.2 14 Q12.6 5.6 18 5.2 Q23.4 5.6 22.8 14 L21.6 12 Q18 9.4 14.4 12 Z" fill="#3E5524" />
    </g>
    {/* drawn bow */}
    <g {...line}>
      <path d="M7.6 10 Q2.4 22 7.6 34" fill="none" stroke={WOOD} strokeWidth="2" />
      <path d="M7.6 10 L13.4 22 L7.6 34" fill="none" stroke="#EFE3CC" strokeWidth="0.7" />
      <path d="M5.4 22 H18" stroke={WOOD_D} strokeWidth="1" />
      <path d="M3.4 22 L6 20.6 L6 23.4 Z" fill={IRON} />
      <path d="M13.6 19.6 L7 21.6" fill="none" stroke={O} strokeWidth="2.4" />
    </g>
  </g>
);

const Axeman = () => (
  <g>
    {/* big two-handed axe */}
    <g {...line}>
      <path d="M25.6 37 L29 5" stroke={WOOD_D} strokeWidth="1.9" />
      <path d="M28.6 7.6 Q35.6 6.4 36 13 Q33.6 15.4 28 13.6 Z" fill={IRON} />
    </g>
    <Footman tunic="#7A4A22" trousers="#4A3B26" />
    {/* fur cape on the shoulders */}
    <path d="M12.6 19.4 Q18 15 23.4 19.4 Q21 21.6 18 20.6 Q15 21.6 12.6 19.4 Z" fill="#C9A26B" {...line} />
    {/* bare head with wild hair and beard */}
    <g {...line}>
      <path d="M13.6 11.4 Q13.4 6.6 18 6.6 Q22.6 6.6 22.4 11.4 Q20.8 9 18 9 Q15.2 9 13.6 11.4 Z" fill="#B0602A" />
      <path d="M14.4 13.2 Q18 19.4 21.6 13.2 Q18 15 14.4 13.2 Z" fill="#B0602A" />
    </g>
    {/* arms on the haft */}
    <path d="M13.4 20 L26.4 26 M22.6 19.6 L27.4 21" fill="none" {...line} stroke={O} strokeWidth="2.6" />
  </g>
);

/** Horse in side view facing right; `barding` covers it in cloth. */
const Horse = ({ coat, barding }: { coat: string; barding?: string }) => (
  <g {...line}>
    <path d="M8.6 25.6 Q4 27 4.4 33" fill="none" stroke="#3A2414" strokeWidth="2" />
    <path d="M10.6 30 l-1 7.4 M14 31 l0.4 6.6 M24 31 l0.6 6.6 M27.6 30 l1.4 7.2" fill="none" stroke={coat} strokeWidth="2.4" />
    <path d="M10.6 30 l-1 7.4 M14 31 l0.4 6.6 M24 31 l0.6 6.6 M27.6 30 l1.4 7.2" fill="none" stroke={O} strokeWidth="0.4" />
    <ellipse cx="18.6" cy="27" fill={coat} rx="11" ry="5.6" />
    <path d="M26 24 Q28 16 31 13.6 L36.6 17 Q37.6 19 35.6 19.6 L31.6 19 Q30.6 24 29 28 Z" fill={coat} />
    <path d="M29.6 13.8 L30.4 10.6 L32 13.6" fill={coat} />
    <path d="M27.6 18 Q29 14.6 30.6 13.6" fill="none" stroke="#3A2414" strokeWidth="1.8" />
    {barding && <path d="M8 24.6 Q18.6 21 29.4 24.6 L28.6 31.4 Q18.6 34.4 8.6 31.4 Z" fill={barding} />}
    {barding && <path d="M8.6 31.4 Q18.6 34.4 28.6 31.4" fill="none" stroke={GOLD} strokeWidth="1" />}
    <circle cx="32.8" cy="15.6" fill={O} r="0.6" stroke="none" />
  </g>
);

/** Upper body of a rider sitting on the horse (center x = 18). */
const Rider = ({ tunic }: { tunic: string }) => (
  <g {...line}>
    <path d="M14.4 22.6 L16.6 28 L19.6 28 L21.6 22.6 Z" fill="#4A3B26" />
    <path d="M14 22.8 Q13.6 15.8 18 14.6 Q22.4 15.8 22 22.8 Z" fill={tunic} />
    <circle cx="18" cy="10.4" fill={SKIN} r="3.6" />
  </g>
);

const LightCavalry = () => (
  <g>
    <Horse coat="#9A5A2C" />
    <Rider tunic="#2F5E9E" />
    <g {...line}>
      <path d="M13.8 10.8 Q14 5.6 18 5 Q22 5.6 22.2 10.8 Z" fill={LEATHER} />
      {/* short lance held forward */}
      <path d="M10 22 L37 9" stroke={WOOD_D} strokeWidth="1.5" />
      <path d="M37 9 L39.4 7.4 L38 10.2 Z" fill={IRON} />
      <path d="M21.6 18 L25 16.4" fill="none" stroke={O} strokeWidth="2.4" />
    </g>
  </g>
);

const Paladin = () => (
  <g>
    <Horse barding="#EFE3CC" coat="#E8E0D0" />
    <Rider tunic="#C9CED6" />
    <g {...line}>
      <path d="M14 11 Q14 5.4 18 5.4 Q22 5.4 22 11 Z" fill={IRON} />
      <path d="M14 9.6 h8" stroke={GOLD} strokeWidth="1.2" />
      {/* mace raised */}
      <path d="M22 17 L26.6 7" stroke={WOOD_D} strokeWidth="1.5" />
      <circle cx="27" cy="6" fill={IRON_D} r="2.2" />
      {/* big shield with a cross */}
      <path d="M8.6 14.6 Q13 13 17.4 14.6 Q17.4 22.6 13 27 Q8.6 22.6 8.6 14.6 Z" fill="#F2F5F8" />
      <path d="M13 15 V25.6 M9.6 18.6 h6.8" stroke="#B8352A" strokeWidth="1.8" />
    </g>
  </g>
);

const Knight = () => (
  <g>
    <Horse barding="#B8352A" coat="#3A2A1E" />
    <Rider tunic={IRON} />
    <g {...line}>
      {/* great helm with a plume */}
      <path d="M14.4 12.6 L14.4 7.4 Q18 5 21.6 7.4 L21.6 12.6 Z" fill={IRON} />
      <path d="M15 9.6 h6" stroke={O} strokeWidth="1" />
      <path d="M18 5.6 Q15 1.6 19.6 0.8 Q18.6 3 21 4 Z" fill={GOLD} />
      {/* couched lance with pennant */}
      <path d="M8 21 L39.6 15.6" stroke={WOOD} strokeWidth="2" />
      <path d="M30 17.2 L35.6 16.2 L33 19.8 Z" fill="#2F5E9E" />
      <path d="M21.6 18 L25.6 18.4" fill="none" stroke={O} strokeWidth="2.4" />
    </g>
  </g>
);

const Ram = () => (
  <g {...line}>
    <path d="M6 18 L15 9 L27 9 L35 18 Z" fill="#8C6A44" />
    <path d="M10 18 L17.4 9.6 M15 18 L20 9.6 M20 18 L23 9.6 M25 18 L26 9.6" fill="none" opacity="0.5" />
    <path d="M8.4 18 v11 M31.6 18 v11" stroke={WOOD_D} strokeWidth="2" />
    <path d="M15 18 l1 6 M25 18 l-1 6" stroke={IRON_D} strokeDasharray="1.2 0.8" />
    <rect fill={WOOD} height="5" rx="2.4" width="28" x="4" y="22.4" />
    <path d="M32 21.6 L37.6 23.4 Q39 24.9 37.6 26.4 L32 28.2 Z" fill={IRON_D} />
    <path d="M12 22.4 v5 M20 22.4 v5" stroke={IRON_D} strokeWidth="1.4" />
    <rect fill="#5B3A22" height="3" rx="1" width="30" x="5" y="29" />
    {[10, 20, 30].map((cx) => (
      <g key={cx}>
        <circle cx={cx} cy="34.4" fill="#4A2E16" r="3.4" />
        <circle cx={cx} cy="34.4" fill={IRON_D} r="1" />
      </g>
    ))}
  </g>
);

const Catapult = () => (
  <g {...line}>
    {/* throwing arm with a boulder */}
    <path d="M18 27 L7.6 7.6" stroke={WOOD_D} strokeWidth="2.2" />
    <path d="M4.4 6.6 Q7.4 10.8 10.8 7.6 Z" fill={WOOD} />
    <circle cx="7.4" cy="5.4" fill="#8E8E8E" r="2.8" />
    {/* frame */}
    <path d="M14 29 L20 15 L26 29" fill="none" stroke={WOOD} strokeWidth="2.2" />
    <path d="M17.4 21 h5.2" stroke={WOOD_D} strokeWidth="1.8" />
    <path d="M28 25 h7 v4 h-7 Z" fill="#8E8E8E" />
    <rect fill={WOOD} height="3.4" rx="1" width="30" x="5" y="28.6" />
    {[10, 30].map((cx) => (
      <g key={cx}>
        <circle cx={cx} cy="34.4" fill="#4A2E16" r="3.6" />
        <circle cx={cx} cy="34.4" fill={IRON_D} r="1" />
      </g>
    ))}
  </g>
);

const FIGURES: Record<UnitId, () => JSX.Element> = {
  spearman: Spearman,
  swordsman: Swordsman,
  archer: Archer,
  axeman: Axeman,
  cavalry: LightCavalry,
  paladin: Paladin,
  knight: Knight,
  ram: Ram,
  catapult: Catapult,
};

export const UnitIcon = ({ unit, size = 20, className }: { unit: UnitId; size?: number; className?: string }) => {
  const Figure = FIGURES[unit];

  return (
    <svg aria-label={unit} className={className} height={size} role="img" viewBox="0 0 40 40" width={size}>
      <Figure />
    </svg>
  );
};
