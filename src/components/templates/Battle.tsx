"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";

import bg from "~/images/background/battle.webp";

import dynamic from "next/dynamic";

import { WarMap } from "@/components/organisms/war/WarMap";
import type { AttackTarget } from "@/components/organisms/war/SendArmyDrawer";

// Tabs and drawers that aren't on screen when the page opens load separately.
const ArmyTab = dynamic(() => import("@/components/organisms/war/ArmyTab").then((m) => m.ArmyTab));
const ReportsTab = dynamic(() => import("@/components/organisms/war/ReportsTab").then((m) => m.ReportsTab));
const SendArmyDrawer = dynamic(() => import("@/components/organisms/war/SendArmyDrawer").then((m) => m.SendArmyDrawer));
import { Tabs } from "@/components/organisms/war/shared";
import { useLive } from "@/context";

type Tab = "map" | "army" | "reports";

export const Battle = () => {
  // Only the training badge: the screen (and every tab under it) no longer redraws every second.
  const training = useLive((l) => l.state.training.length);
  const [tab, setTab] = useState<Tab>("map");
  const [target, setTarget] = useState<AttackTarget | null>(null);
  const [revenge, setRevenge] = useState<number | undefined>();
  const [camp, setCamp] = useState<number | undefined>();
  // ?attack=<playerId> (a spy's "Attack them"): also open the send-army sheet on arrival.
  const [strike, setStrike] = useState(false);
  // Bumped by every jump, so the map starts over on the new spot even when it was
  // already open (it only centres once, on its first load) or on the same tribe.
  const [jump, setJump] = useState(0);

  // /battle?revenge=<playerId> (Hall), ?target=<playerId> (Leaderboard) or
  // ?attack=<playerId> (a spy's report, sheet open) opens the map on
  // that tribe with its card up; ?camp=<level> (Hall) does the same for a barbarian camp;
  // /battle?tab=<tab> picks a tab. Each happens once: it's taken off the address (so the
  // same link tapped again later still works), and leaving the map forgets a jump (see pickTab).
  // Read from the router, and again whenever the address changes: a button in the
  // 🔔 inbox can send you to ?tab=reports while you're already on this screen, and
  // on slow phones the page could open before window.location had the new address.
  const query = useSearchParams().toString();

  useEffect(() => {
    const url = new URL(window.location.href);
    const q = new URLSearchParams(query);
    const attack = Number(q.get("attack"));
    const id = attack || Number(q.get("revenge") || q.get("target"));
    const t = q.get("tab");
    const c = Number(q.get("camp"));

    if (["revenge", "target", "attack", "camp", "tab"].some((k) => q.has(k))) {
      const rest = new URLSearchParams(query);

      ["revenge", "target", "attack", "camp", "tab"].forEach((k) => rest.delete(k));
      const search = rest.toString();

      window.history.replaceState(null, "", url.pathname + (search ? `?${search}` : "") + url.hash);
    }

    if (c) {
      setCamp(c);
      setStrike(false);
      setJump((j) => j + 1);
      setTab("map");
    } else if (id) {
      setRevenge(id);
      setStrike(!!attack);
      setJump((j) => j + 1);
      setTab("map");
    } else if (t === "map" || t === "army" || t === "reports") {
      setTab(t);
    } else if (t === "camps" || t === "raid") {
      setTab("map");
    }
  }, [query]);
  // Back on the map after another tab: it opens on your own tribe, not the one you jumped to.
  const pickTab = (t: Tab) => {
    if (t !== tab) {
      setRevenge(undefined);
      setCamp(undefined);
      setStrike(false);
    }
    setTab(t);
  };

  return (
    <>
      <div className="w-full flex flex-col gap-2 px-3 pt-1">
        <div className="w-full max-w-md mx-auto">
          <Tabs
            tabs={[
              { id: "map", label: "Map" },
              {
                id: "army",
                label: "Army",
                badge: training || undefined,
              },
              { id: "reports", label: "Reports" },
            ]}
            value={tab}
            onChange={pickTab}
          />
        </div>
        <div
          className={tab === "map" ? "pb-4" : "pb-4 w-full max-w-md mx-auto"}
        >
          {tab === "map" && (
            <WarMap
              key={jump}
              attackFocus={strike}
              focusCamp={camp}
              focusId={revenge}
              onAttack={setTarget}
            />
          )}
          {tab === "army" && <ArmyTab />}
          {tab === "reports" && (
            <ReportsTab
              onShowOnMap={(id) => {
                setRevenge(id);
                setStrike(false);
                setJump((j) => j + 1);
                setTab("map");
              }}
            />
          )}
        </div>
      </div>

      <SendArmyDrawer
        target={target}
        onClose={() => setTarget(null)}
        onSent={() => setTarget(null)}
      />

      <Image
        priority
        alt={"battle"}
        className="fixed h-full top-0 left-0 w-full -z-10 object-cover opacity-20"
        src={bg}
      />
    </>
  );
};
