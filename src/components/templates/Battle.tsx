"use client";
import React, { useEffect, useState } from "react";
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
  const [revenge, setRevenge] = useState<number | undefined>();

  // /battle?revenge=<playerId> and /battle?tab=<tab> come from the Hall.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = Number(q.get("revenge"));
    const t = q.get("tab") as Tab | null;

    if (id) {
      setRevenge(id);
      setTab("raid");
    } else if (t && ["army", "raid", "camps", "reports"].includes(t)) {
      setTab(t);
    }
  }, []);

  return (
    <>
      <div className="w-full flex flex-col gap-2 px-3 pt-1">
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
        <div className="pb-4">
          {tab === "army" && <ArmyTab />}
          {tab === "raid" && <RaidTab revenge={revenge} onAttack={setTarget} />}
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
        className="fixed h-full top-0 left-0 w-full -z-10 object-cover opacity-20"
        src={bg}
      />
    </>
  );
};
