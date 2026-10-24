"use client";
import clsx from "clsx";

import { fmt } from "./shared";
import { AttackTarget } from "./SendArmyDrawer";

import { Amount, Badge, Button, Card, Icon } from "@/components/ui";
import { BuildingArt } from "@/art";
import { useGame } from "@/context";
import { MAX_CAMP_LEVEL, campDefense } from "@/lib/game/config";
import { campReward, campStatus } from "@/lib/game/war";
import { formatDuration } from "@/lib/format";

export const CampsTab = ({ onAttack }: { onAttack: (t: AttackTarget) => void }) => {
  const { state, now } = useGame();
  const shown = Math.min(MAX_CAMP_LEVEL, state.camps.cleared + 3);
  const levels = Array.from({ length: shown }, (_, i) => shown - i); // hardest first

  return (
    <div className="flex flex-col gap-2.5">
      <Card className="text-small text-parch-300" tone="sunken">
        Barbarian camps don&apos;t fight back between battles. Beat each camp for a big first-time reward, unlock the next one, and raid beaten camps again every hour for a smaller haul.
      </Card>
      {levels.map((level) => {
        const st = campStatus(state, level, now);
        const reward = campReward(state, level);
        const def = campDefense(level);
        const beaten = level <= state.camps.cleared;

        return (
          <Card key={level} className={clsx("flex items-center gap-3", st.state === "locked" && "opacity-60")}>
            <div className="relative w-16 h-16 shrink-0 rounded-2xl overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#4A3D2F_0%,#2A221A_70%)] border border-ink-500">
              <BuildingArt className={clsx("absolute -inset-1 w-[72px] h-[72px]", st.state === "locked" && "grayscale")} id="military-command" level={Math.min(20, level * 2)} />
              {st.state === "locked" && (
                <span className="absolute inset-0 flex items-center justify-center bg-ink-950/50 text-parch-300">
                  <Icon name="lock" size={22} />
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-title">Camp {level}</span>
                {beaten && <Badge tone="moss">Beaten</Badge>}
              </div>
              <Amount icon="defense" size="xs" value={def} />
              <div className="flex flex-wrap gap-x-2.5 text-caption font-bold text-parch-500">
                <Amount icon="loot" size="xs" suffix=" each" value={fmt(reward.resources)} />
                <Amount icon="coin" size="xs" value={reward.coins} />
                {reward.first && <span className="text-gold-300">first win</span>}
              </div>
            </div>
            {st.state === "cooldown" ? (
              <span className="flex flex-col items-end text-caption font-bold text-parch-500">
                <Icon name="clock" size={16} />
                {formatDuration(st.readyAt - now)}
              </span>
            ) : (
              <Button
                disabled={st.state === "locked"}
                size="sm"
                variant="danger"
                onClick={() =>
                  onAttack({
                    title: `Barbarian camp ${level}`,
                    to: { camp: level },
                    defense: { min: def, max: def, exact: true },
                  })
                }
              >
                Attack
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
};
