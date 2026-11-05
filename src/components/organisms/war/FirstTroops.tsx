"use client";
import Image from "next/image";
import Link from "next/link";

import { Card } from "./shared";

import { Button } from "@/components/atoms/Button";
import { GameIcon, IconText } from "@/components/atoms/GameIcon";
import { useGame } from "@/context";
import { BUILDING_BY_ID, buildingImage } from "@/lib/game/config";
import { buildingUpgradeInfo } from "@/lib/game/engine";
import { formatDuration } from "@/lib/format";

/**
 * A tribe with no Barracks has nothing to train and nobody to send: the Army
 * tab was a wall of locked troops and Reports said "raid a camp". This card
 * says what to do instead, with the button to do it.
 */
export const FirstTroops = ({ reason = "train" }: { reason?: "train" | "raid" }) => {
  const { state, rates, upgradeBuilding } = useGame();
  const barracks = BUILDING_BY_ID["barracks"];
  const level = state.buildings["barracks"] ?? 0;
  const building = state.queue.some((q) => q.building === "barracks");
  const info = buildingUpgradeInfo(state, "barracks");
  const free = rates.builders - state.queue.length > 0;
  const short = Object.entries(info.cost).some(([r, n]) => (state.resources[r as keyof typeof state.resources] ?? 0) < n);
  const hallFirst = (state.buildings["town-hall"] ?? 0) === 0;
  const hallBusy = state.queue.some((q) => q.building === "town-hall");
  const hall = buildingUpgradeInfo(state, "town-hall");
  const hallShort = Object.entries(hall.cost).some(([r, n]) => (state.resources[r as keyof typeof state.resources] ?? 0) < n);

  return (
    <Card className="flex items-center gap-3 border-gold/50">
      <Image alt="" className="w-14 h-14 object-contain shrink-0" height={112} src={buildingImage(barracks)} width={112} />
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <span className="font-bold text-parch leading-tight">
          {reason === "raid" ? "Raid with your first army" : "Train your first troops"}
        </span>
        <span className="text-xs text-sub leading-snug">
          {level === 0
            ? building
              ? "Your Barracks is going up. Spearmen unlock when it's done."
              : "Build a Barracks to train Spearmen, then raid a barbarian camp for loot."
            : "Train troops in the Army tab, then raid a barbarian camp on the map."}
        </span>
        {level === 0 && !building && (
          info.blocked ? (
            // A brand-new tribe has no Town Hall, which the Barracks needs: build that first, from here.
            hallFirst ? (
              <Button className="self-start" disabled={!free || hallShort || hallBusy} size="small" onClick={() => upgradeBuilding("town-hall")}>
                <IconText text={hallBusy ? "🏛️ Town Hall going up…" : !free ? "No free builder" : hallShort ? "Not enough resources" : "🏛️ Build the Town Hall first"} />
              </Button>
            ) : (
              <Link className="btn btn-wood btn-sm self-start" href="/tribe">
                {info.blocked}
              </Link>
            )
          ) : (
            <Button
              className="self-start"
              disabled={!free || short}
              size="small"
              onClick={() => upgradeBuilding("barracks")}
            >
              <IconText text={!free ? "No free builder" : short ? "Not enough resources" : `🔨 Build Barracks · ${formatDuration(info.seconds * 1000)}`} />
            </Button>
          )
        )}
        {level > 0 && reason === "raid" && (
          <Link className="btn btn-gold btn-sm self-start" href="/battle?tab=army">
            <GameIcon e="⚔️" /> Train troops
          </Link>
        )}
      </div>
    </Card>
  );
};
