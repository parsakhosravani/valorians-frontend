"use client";
import { useCallback, useEffect, useState } from "react";

import { fmt } from "./shared";
import { AttackTarget } from "./SendArmyDrawer";

import { Amount, Avatar, Button, Card, Empty, SectionTitle, Spinner } from "@/components/ui";
import { GameIcon } from "@/art";
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

export const RaidTab = ({ onAttack, revenge }: { onAttack: (t: AttackTarget) => void; revenge?: number }) => {
  const { state, now, authHeader, rates } = useGame();
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shielded = state.shieldUntil > now;

  const load = useCallback(() => {
    if (!authHeader) return;
    setTargets(null);
    setError(null);
    apiRequest<{ targets: Target[] }>(authHeader, revenge ? `war/targets?include=${revenge}` : "war/targets")
      .then((r) => setTargets(r.targets))
      .catch((e) => setError(e.message));
  }, [authHeader, revenge]);

  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-2.5">
      <Card className="flex flex-col gap-1.5 text-small text-parch-300" tone="sunken">
        <p>
          Raid other tribes to steal resources. Win and your survivors carry loot home; lose and your army falls.
          {!rates.canScout && " Build an Exploration Center to see enemies' exact defense."}
        </p>
        <p>
          Raided tribes get a {RAIDED_SHIELD_MS / 3600000}h shield, and your Hideout keeps {fmt(rates.hidden)} of each resource safe.
        </p>
        {shielded && (
          <p className="flex items-center gap-1.5 font-bold text-gold-300">
            <GameIcon id="shield-time" size={18} />
            Shielded for {formatDuration(state.shieldUntil - now)}. Attacking a player ends your shield.
          </p>
        )}
      </Card>

      <SectionTitle
        action={
          <Button icon="refresh" size="sm" variant="ghost" onClick={load}>
            Find others
          </Button>
        }
      >
        Tribes nearby
      </SectionTitle>

      {error && <p className="text-small text-blood-400">{error}</p>}
      {!targets && !error && <Spinner label="Scouting" />}
      {targets?.length === 0 && (
        <Empty title="Nobody to raid right now">Everyone nearby is shielded. Try the barbarian camps, or check back later.</Empty>
      )}
      {targets?.map((t) => (
        <Card key={t.id} className="flex items-center gap-3" tone={t.id === revenge ? "danger" : "default"}>
          <Avatar seed={t.id} size={44} src={t.photoUrl} />
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-title truncate">
              {t.name}
              {t.id === revenge && <span className="ml-1.5 text-caption font-extrabold text-ember-300">REVENGE</span>}
            </div>
            <div className="flex gap-x-3 flex-wrap">
              <Amount icon="population" size="xs" value={t.population} />
              <Amount icon="attack" size="xs" value={t.power} />
              <Amount icon="defense" size="xs" value={t.defense.exact ? fmt(t.defense.min) : `${fmt(t.defense.min)}–${fmt(t.defense.max)}`} />
            </div>
          </div>
          <Button
            size="sm"
            variant="danger"
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
