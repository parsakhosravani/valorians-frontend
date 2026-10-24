"use client";
import React, { useEffect, useState } from "react";

import { ArmyTab, BattleResultDrawer, CampsTab, RaidTab, ReportsTab, SendArmyDrawer } from "@/components/organisms/war";
import type { AttackTarget } from "@/components/organisms/war";
import { Backdrop, Segmented } from "@/components/ui";
import { BattleReport, useGame } from "@/context";

type Tab = "army" | "raid" | "camps" | "reports";

export const Battle = () => {
  const { state } = useGame();
  const [tab, setTab] = useState<Tab>("army");
  const [target, setTarget] = useState<AttackTarget | null>(null);
  const [result, setResult] = useState<BattleReport | null>(null);
  const [revenge, setRevenge] = useState<number | undefined>();

  // /battle?revenge=<playerId> comes from the Hall feed.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("revenge"));

    if (id) {
      setRevenge(id);
      setTab("raid");
    }
  }, []);

  return (
    <>
      <div className="w-full flex flex-col gap-2.5 px-3 pt-1">
        <Segmented
          options={[
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

      <Backdrop scene="battle" />
    </>
  );
};
