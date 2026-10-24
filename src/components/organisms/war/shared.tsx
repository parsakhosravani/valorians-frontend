"use client";
import clsx from "clsx";

import { TroopArt } from "@/art";
import { UNITS, UnitId, UNIT_BY_ID } from "@/lib/game/config";
import type { Army } from "@/lib/game/engine";

export const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

/** A troop portrait in a round frame. */
export const UnitBadge = ({ unit, size = 36 }: { unit: UnitId; size?: number }) => (
  <span
    className="relative shrink-0 rounded-2xl overflow-hidden bg-[radial-gradient(ellipse_at_50%_30%,#4A3D2F_0%,#2A221A_70%)] border border-ink-400"
    style={{ width: size, height: size }}
  >
    <TroopArt className="absolute inset-0 w-full h-full scale-[1.15] translate-y-[6%]" id={unit} title={UNIT_BY_ID[unit].name} />
  </span>
);

/** Little troop faces with counts — only units with a count. */
export const ArmyLine = ({ army, className }: { army: Army; className?: string }) => {
  const parts = UNITS.filter((u) => (army[u.id] ?? 0) > 0);

  if (!parts.length) return <span className={clsx("text-parch-500", className)}>none</span>;

  return (
    <span className={clsx("inline-flex flex-wrap gap-x-2.5 gap-y-1 align-middle", className)}>
      {parts.map((u) => (
        <span key={u.id} className="inline-flex items-center gap-1 font-extrabold">
          <TroopArt className="w-5 h-5" id={u.id} title={u.name} />
          {fmt(army[u.id])}
        </span>
      ))}
    </span>
  );
};
