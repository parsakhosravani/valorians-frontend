"use client";
import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";

import bg from "~/images/background/battle.webp";

import { ArmyTab, BattleResultDrawer, ReportsTab, SendArmyDrawer, WarMap } from "@/components/organisms/war";
import type { AttackTarget } from "@/components/organisms/war";
import { Tabs } from "@/components/organisms/war/shared";
import { BattleReport, useGame } from "@/context";

type Tab = "map" | "army" | "reports";

export const Battle = () => {
  const { state } = useGame();
  const [tab, setTab] = useState<Tab>("map");
  const [target, setTarget] = useState<AttackTarget | null>(null);
  const [result, setResult] = useState<BattleReport | null>(null);
  const [revenge, setRevenge] = useState<number | undefined>();

  // /battle?revenge=<playerId> and /battle?tab=<tab> come from the Hall.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = Number(q.get("revenge"));
    const t = q.get("tab");

    if (id) {
      setRevenge(id);
      setTab("map");
    } else if (t === "map" || t === "army" || t === "reports") {
      setTab(t);
    } else if (t === "camps" || t === "raid") {
      setTab("map");
    }
  }, []);
  const showResult = useCallback((r: BattleReport) => setResult(r), []);

  return (
    <>
      <div className="w-full flex flex-col gap-2 px-3 pt-1">
        <Tabs
          tabs={[
            { id: "map", label: "Map" },
            { id: "army", label: "Army", badge: state.training.length || undefined },
            { id: "reports", label: "Reports" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="pb-4">
          {tab === "map" && <WarMap focusId={revenge} onAttack={setTarget} onBattleDone={showResult} />}
          {tab === "army" && <ArmyTab />}
          {tab === "reports" && <ReportsTab />}
        </div>
      </div>

      <SendArmyDrawer
        target={target}
        onClose={() => setTarget(null)}
        onSent={() => setTarget(null)}
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
