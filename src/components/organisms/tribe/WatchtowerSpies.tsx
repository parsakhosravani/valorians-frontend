"use client";
import { useState } from "react";
import Image from "next/image";

import coinImg from "~/images/resources/coin.webp";
import { Button } from "@/components/atoms/Button";
import { GameIcon } from "@/components/atoms/GameIcon";
import { SectionTitle } from "@/components/atoms/Ui";
import { useGame } from "@/context";
import { SPY } from "@/lib/game/config";

/**
 * The Watchtower's spy watch: how many enemy spies are in the village and a
 * paid search for them. Below SPY.seeLevel the tower can't count them yet,
 * so it says what the next levels unlock instead.
 */
export const WatchtowerSpies = () => {
  const { state, me, sweepSpies } = useGame();
  const [busy, setBusy] = useState(false);
  const level = state.buildings["watchtower"] ?? 0;
  // Older servers don't send the count: treat that like "can't see yet".
  const count = me.spiesInside ?? null;

  if (level < SPY.seeLevel || count === null)
    return (
      <div className="inset p-3 text-[13px] text-sub leading-snug">
        <GameIcon e="🕵️" /> Your Watchtower catches enemy spies, more often the higher it is. At level {SPY.seeLevel}{" "}
        it also counts the spies hiding in your village and can search for them.
      </div>
    );

  const onSweep = async () => {
    setBusy(true);
    await sweepSpies();
    setBusy(false);
  };
  const short = state.coins < SPY.sweepCost;

  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>Spy watch</SectionTitle>
      <div className="inset p-3 flex flex-col gap-1 text-[13px] leading-snug">
        <span className="font-extrabold text-parch">
          <GameIcon e="🕵️" />{" "}
          {count === 0 ? "No spies in your village." : `${count} ${count === 1 ? "spy is" : "spies are"} hiding in your village.`}
        </span>
        <span className="text-sub">
          {count === 0
            ? "Your Watchtower keeps count: check back here if you think someone is watching you."
            : "They'll report the moment your army marches out. Search the village to catch them and learn who sent them."}
        </span>
      </div>
      {count > 0 && (
        <Button isFull disabled={busy || short} size="large" onClick={onSweep}>
          <span className="flex items-center justify-center gap-1.5">
            {short ? "Not enough coins:" : "Search the village"}
            <Image alt="coins" className="w-4 h-4 object-contain" src={coinImg} />
            {SPY.sweepCost}
          </span>
        </Button>
      )}
    </div>
  );
};
