"use client";
import clsx from "clsx";

import { Card, fmt } from "./shared";
import { AttackTarget } from "./SendArmyDrawer";

import { Button } from "@/components";
import { useGame } from "@/context";
import { MAX_CAMP_LEVEL, campDefense } from "@/lib/game/config";
import { campReward, campStatus } from "@/lib/game/war";
import { formatDuration } from "@/lib/format";

export const CampsTab = ({ onAttack }: { onAttack: (t: AttackTarget) => void }) => {
  const { state, now } = useGame();
  const shown = Math.min(MAX_CAMP_LEVEL, state.camps.cleared + 3);
  const levels = Array.from({ length: shown }, (_, i) => shown - i); // hardest first

  return (
    <div className="flex flex-col gap-2">
      <Card className="text-xs text-[#B19C80]">
        Barbarian camps don&apos;t fight back between battles. Beat each camp for a big first-time reward, unlock the
        next one, and raid beaten camps again every hour for a smaller haul.
      </Card>
      {levels.map((level) => {
        const st = campStatus(state, level, now);
        const reward = campReward(state, level);
        const def = campDefense(level);

        return (
          <Card key={level} className={clsx("flex items-center gap-3", st.state === "locked" && "opacity-50")}>
            <div className="text-3xl">{st.state === "locked" ? "🔒" : level <= state.camps.cleared ? "🏳️" : "🏕️"}</div>
            <div className="flex-1 min-w-0">
              <div className="font-bold">Barbarian camp {level}</div>
              <div className="text-xs text-[#B19C80] flex flex-wrap gap-x-2">
                <span>🛡️ {fmt(def)}</span>
                <span>
                  🎁 {fmt(reward.resources)} each + 🪙 {fmt(reward.coins)}
                  {reward.first ? " (first win)" : ""}
                </span>
              </div>
            </div>
            {st.state === "cooldown" ? (
              <span className="text-xs text-[#B19C80] text-right">{formatDuration(st.readyAt - now)}</span>
            ) : (
              <Button
                disabled={st.state === "locked"}
                size="small"
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
