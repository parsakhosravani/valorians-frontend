"use client";

import React from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { Coin, User } from "@/components";
import { RESOURCES, useGame } from "@/context";
import { compact } from "@/lib/format";

/** Top bar on every screen; Build and War also show your stock. */
export const Header: React.FC = () => {
  const { state, rates } = useGame();
  const pathname = usePathname();
  const showResources = pathname === "/tribe" || pathname === "/battle";

  return (
    <header className="w-full flex flex-col gap-2 px-3 pt-3 pb-2 z-20 bg-ground/80 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <User />
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 bg-panel border border-line rounded-full pl-1.5 pr-3 h-8">
          <Coin amount={Math.floor(state.coins)} />
        </div>
      </div>

      {showResources && (
        <div className="grid grid-cols-4 gap-1.5">
          {RESOURCES.map((r) => {
            const full = state.resources[r.id] >= rates.capacity;
            const perHour = rates.productionPerHour[r.id];

            return (
              <div key={r.id} className="bg-panel border border-line rounded-lg py-1 px-1 flex items-center gap-1 justify-center">
                <Image alt={r.name} className="w-4 h-4" src={r.img} />
                <div className="flex flex-col leading-none">
                  <span className={full ? "text-bad text-xs font-extrabold" : "text-xs font-extrabold"}>
                    {compact(state.resources[r.id])}
                  </span>
                  <span className={perHour < 0 ? "text-bad text-[10px] font-bold" : "text-good text-[10px] font-bold"}>
                    {perHour >= 0 ? "+" : ""}
                    {Math.round(perHour)}/h
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </header>
  );
};
