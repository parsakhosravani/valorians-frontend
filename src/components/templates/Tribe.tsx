"use client";

import React, { FunctionComponent, useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { Builder, Building, Drawer } from "@/components";
import { Tabs } from "@/components/organisms/war/shared";
import { BUILDINGS, BuildingDef } from "@/lib/game/config";
import { useGame } from "@/context";

// Three.js only loads when the village is shown.
const Village3D = dynamic(() => import("@/components/organisms/tribe/Village3D"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-ground">
      <div className="h-10 w-10 rounded-full border-4 border-gold border-t-transparent animate-spin" />
    </div>
  ),
});

type View = "map" | "list";
const VIEW_KEY = "valorians:build-view";

export const Tribe: FunctionComponent = () => {
  const { state } = useGame();
  const [view, setView] = useState<View>("map");
  const [open, setOpen] = useState<BuildingDef | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "list") setView("list");
    } catch {}
  }, []);

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  // In the list, buildings under construction float to the top.
  const sorted = [...BUILDINGS].sort((a, b) => {
    const qa = state.queue.some((q) => q.building === a.id) ? 1 : 0;
    const qb = state.queue.some((q) => q.building === b.id) ? 1 : 0;

    return qb - qa;
  });

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 pt-1 flex flex-col gap-2">
        <Builder />
        <Tabs
          tabs={[
            { id: "map", label: "Village" },
            { id: "list", label: "List" },
          ]}
          value={view}
          onChange={changeView}
        />
      </div>

      {view === "map" ? (
        <div className="relative flex-1 min-h-0 mt-2 mx-3 rounded-2xl overflow-hidden border border-line">
          <Village3D onOpen={setOpen} onUnsupported={() => changeView("list")} />
        </div>
      ) : (
        <div className="space-y-2.5 w-full px-3 pt-2 pb-4">
          {sorted.map((item) => (
            <Building key={item.id} building={item} />
          ))}
        </div>
      )}

      <Drawer isOpen={!!open} position="bottom" onClose={() => setOpen(null)}>
        {open && (
          <div className="pt-1">
            <Building building={open} />
          </div>
        )}
      </Drawer>
    </div>
  );
};
