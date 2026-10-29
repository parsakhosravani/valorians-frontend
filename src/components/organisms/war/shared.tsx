"use client";
import clsx from "clsx";

import { BANDIT, UNITS, UnitId, UNIT_BY_ID, banditStrength } from "@/lib/game/config";
import { Segmented } from "@/components/atoms/Ui";
import { GameIcon } from "@/components/atoms/GameIcon";
import type { Army, GameState } from "@/lib/game/engine";
import { Lair, ambushLosses, lairsOnRoute } from "@/lib/game/bandits";
import { Point, marchRoute } from "@/lib/game/map";
import { attackPower, fighterCount } from "@/lib/game/war";
import { grouped } from "@/lib/format";

export const fmt = (n: number) => grouped(Math.floor(n));

export const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={clsx("card p-3", className)}>
    {children}
  </div>
);

/** Painted troop portrait (public/images/troops/<id>.webp). */
export const unitImage = (unit: UnitId) => `/images/troops/${unit}.webp`;

/** A troop's icon sized to the surrounding text. */
export const UnitEmoji = ({ unit }: { unit: UnitId }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    alt={UNIT_BY_ID[unit].name}
    className="inline-block align-[-0.3em] w-[1.45em] h-[1.45em] object-contain"
    draggable={false}
    src={unitImage(unit)}
  />
);

export const UnitBadge = ({ unit, size = 36, rank = 0 }: { unit: UnitId; size?: number; rank?: number }) => (
  <div
    className="relative rounded-full bg-panel border-2 border-gold shrink-0"
    style={{ width: size, height: size }}
  >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      alt={UNIT_BY_ID[unit].name}
      className="w-full h-full rounded-full object-contain p-[8%]"
      draggable={false}
      src={unitImage(unit)}
    />
    {/* One star per rank, on a little gold tab under the badge. */}
    {rank > 0 && (
      <span
        className="absolute left-1/2 -translate-x-1/2 rounded-full bg-gold text-[#1A120B] leading-none px-1 py-px whitespace-nowrap"
        style={{ bottom: -size * 0.16, fontSize: Math.max(7, size * 0.17) }}
      >
        {"★".repeat(rank)}
      </span>
    )}
  </div>
);

/** "🛡️ 12  🏹 3" — only units with a count. */
export const ArmyLine = ({ army, className }: { army: Army; className?: string }) => {
  const parts = UNITS.filter((u) => (army[u.id] ?? 0) > 0);

  if (!parts.length) return <span className={clsx("text-muted", className)}>none</span>;

  return (
    <span className={clsx("inline-flex flex-wrap gap-x-2", className)}>
      {parts.map((u) => (
        <span key={u.id}>
          <UnitEmoji unit={u.id} /> {fmt(army[u.id])}
        </span>
      ))}
    </span>
  );
};

/** War screen tabs: the shared v2 segmented control. */
export const Tabs = Segmented;

export const Stepper = ({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
}) => {
  const set = (n: number) => onChange(Math.max(0, Math.min(max, Math.floor(n || 0))));

  return (
    <div className="flex items-center gap-1">
      <button aria-label="One less" className="btn btn-wood btn-sm w-8 px-0" type="button" onClick={() => set(value - 1)}>
        −
      </button>
      <input
        className="inset w-12 h-8 text-center text-sm font-extrabold tabular-nums outline-none focus:border-gold"
        inputMode="numeric"
        value={value}
        onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")))}
      />
      <button aria-label="One more" className="btn btn-wood btn-sm w-8 px-0" type="button" onClick={() => set(value + 1)}>
        +
      </button>
      <button className="btn btn-ghost btn-sm px-2.5" type="button" onClick={() => set(max)}>
        Max
      </button>
    </div>
  );
};

/** A bandit lair on the map, as the server sends it. */
export type MapLair = Lair & {
  /** Bandits are there now. */
  active: boolean;
  /** Cleared: when new bandits move in. */
  backAt: number | null;
  clearedByMe: boolean;
  strength: number;
  bounty: { resources: number; coins: number };
};

/**
 * What the bandits on the road mean for this army: how many lairs it passes,
 * and whether they'd dare to ambush it and what that would cost.
 */
export const BanditWarning = ({
  s,
  units,
  from,
  to,
  lairs,
}: {
  s: GameState;
  units: Army;
  from: Point;
  to: Point;
  lairs?: MapLair[];
}) => {
  const manned = (lairs ?? []).filter((l) => l.active);

  if (!manned.length || fighterCount(units) === 0) return null;
  const exposed = lairsOnRoute(marchRoute(from, to), manned, units);

  if (!exposed.length) return null;
  const power = attackPower(s, units);
  const threats = exposed.filter((e) => power < banditStrength(e.lair.level) * BANDIT.shyRatio);
  const lairsText = exposed.length === 1 ? "a bandit lair" : `${exposed.length} bandit lairs`;

  if (!threats.length) {
    return (
      <p className="rounded-xl border border-line bg-panel/70 px-2.5 py-2 text-xs text-sub">
        <GameIcon e="🗡️" /> The road passes {lairsText}, but this army is too strong for them to try anything.
      </p>
    );
  }
  const worst = Math.max(...threats.map((e) => banditStrength(e.lair.level)));
  const loss = Math.round(ambushLosses(power, worst) * 100);
  const chance = Math.round((1 - Math.pow(1 - BANDIT.armyChance, threats.length)) * 100);

  return (
    <p className="rounded-xl border border-[#8A3B23] bg-[#2A140E] px-2.5 py-2 text-xs text-[#FFB27A]">
      <GameIcon e="🗡️" /> <b>Bandits on the road.</b> It passes {lairsText}: a {chance}% chance of an ambush that would
      cost about {loss}% of these troops{power < worst ? ", and half the spoils they carry" : ""}. Send more to scare
      them off, or clear the lair first.
    </p>
  );
};
