"use client";
import React, { useState } from "react";
import Image from "next/image";

import bg from "~/images/background/battle.webp";

import { ArmyTab, BattleResultDrawer, CampsTab, RaidTab, ReportsTab, SendArmyDrawer } from "@/components/organisms/war";
import type { AttackTarget } from "@/components/organisms/war";
import { Tabs } from "@/components/organisms/war/shared";
import { BattleReport, useGame } from "@/context";

type Tab = "army" | "raid" | "camps" | "reports";

export const Battle = () => {
  const { state } = useGame();
  const [tab, setTab] = useState<Tab>("army");
  const [target, setTarget] = useState<AttackTarget | null>(null);
  const [result, setResult] = useState<BattleReport | null>(null);

  return (
    <>
      <div className="w-full h-full flex flex-col gap-2 px-2 self-start">
        <Tabs
          tabs={[
            { id: "army", label: "Army", badge: state.training.length || undefined },
            { id: "raid", label: "Raid" },
            { id: "camps", label: "Camps" },
            { id: "reports", label: "Reports" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="overflow-y-auto scrollable max-h-[64svh] pb-28">
          {tab === "army" && <ArmyTab />}
          {tab === "raid" && <RaidTab onAttack={setTarget} />}
          {tab === "camps" && <CampsTab onAttack={setTarget} />}
          {tab === "reports" && <ReportsTab />}
        </div>
      </div>

      <SendArmyDrawer
        target={target}
        onClose={() => setTarget(null)}
        onResult={(r) => {
          setTarget(null);
          setResult(r);
        }}
      />
      <BattleResultDrawer report={result} onClose={() => setResult(null)} />

      <Image
        priority
        alt={"battle"}
        className="absolute h-full top-0 left-0 w-full -z-10 object-cover opacity-30"
        src={bg}
      />
    </>
  );
};
