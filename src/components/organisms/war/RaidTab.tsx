"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

import avatar from "~/images/avatar.webp";

import { Card, fmt } from "./shared";
import { AttackTarget } from "./SendArmyDrawer";

import { Button } from "@/components";
import { useGame } from "@/context";
import { apiRequest } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { RAIDED_SHIELD_MS } from "@/lib/game/config";

type Target = {
  id: number;
  name: string;
  photoUrl: string | null;
  population: number;
  power: number;
  defense: { min: number; max: number; exact: boolean };
};

export const RaidTab = ({ onAttack }: { onAttack: (t: AttackTarget) => void }) => {
  const { state, now, authHeader, rates } = useGame();
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shielded = state.shieldUntil > now;

  const load = useCallback(() => {
    if (!authHeader) return;
    setTargets(null);
    setError(null);
    apiRequest<{ targets: Target[] }>(authHeader, "war/targets")
      .then((r) => setTargets(r.targets))
      .catch((e) => setError(e.message));
  }, [authHeader]);

  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-2">
      <Card className="text-xs text-[#B5C7DE] flex flex-col gap-1">
        <p>
          Raid other tribes to steal resources. Win and your survivors carry loot home; lose and your army falls.
          {!rates.canScout && " Build an Exploration Center to see enemies' exact defense."}
        </p>
        <p>
          Raided tribes get a {RAIDED_SHIELD_MS / 3600000}h shield, and your Hideout keeps {fmt(rates.hidden)} of each
          resource safe.
        </p>
        {shielded && (
          <p className="text-[#FCA234] font-bold">
            🛡️ You&apos;re shielded for {formatDuration(state.shieldUntil - now)}. Attacking a player ends your shield.
          </p>
        )}
      </Card>

      <div className="flex justify-between items-center">
        <h3 className="font-bold">Tribes nearby</h3>
        <Button size="small" variant="outline" onClick={load}>
          ↻ Find others
        </Button>
      </div>

      {error && <p className="text-sm text-[#F72214]">{error}</p>}
      {!targets && !error && <p className="text-sm text-[#B5C7DE]">Scouting…</p>}
      {targets?.length === 0 && (
        <p className="text-sm text-[#B5C7DE]">
          No tribes can be attacked right now — everyone nearby is shielded. Try the barbarian camps, or check back
          later.
        </p>
      )}
      {targets?.map((t) => (
        <Card key={t.id} className="flex items-center gap-2">
          {t.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" className="h-10 w-10 rounded object-cover" src={t.photoUrl} />
          ) : (
            <Image alt="" className="h-10 w-10 rounded" src={avatar} />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{t.name}</div>
            <div className="text-xs text-[#B5C7DE] flex gap-2 flex-wrap">
              <span>👥 {fmt(t.population)}</span>
              <span>💪 {fmt(t.power)}</span>
              <span>🛡️ {t.defense.exact ? fmt(t.defense.min) : `${fmt(t.defense.min)}–${fmt(t.defense.max)}`}</span>
            </div>
          </div>
          <Button
            size="small"
            onClick={() =>
              onAttack({
                title: `Raid ${t.name}`,
                to: { target: t.id },
                defense: t.defense,
                note: shielded ? "Attacking ends your own shield." : undefined,
              })
            }
          >
            Attack
          </Button>
        </Card>
      ))}
    </div>
  );
};
