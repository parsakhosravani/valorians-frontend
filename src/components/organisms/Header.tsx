"use client";

import React from "react";
import clsx from "clsx";
import { usePathname } from "next/navigation";

import { User } from "./User";

import { Amount } from "@/components/ui";
import { GameIcon } from "@/art";
import { RESOURCES, useGame } from "@/context";
import { compact } from "@/lib/format";

/** Top bar on every screen; Build and War also show your stock. */
export const Header: React.FC = () => {
  const { state, rates } = useGame();
  const pathname = usePathname();
  const showResources = pathname === "/tribe" || pathname === "/battle";

  return (
    <header className="w-full flex flex-col gap-2 px-3 pt-3 pb-2 z-20 bg-gradient-to-b from-ink-900 via-ink-900/95 to-ink-900/80 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <User />
        <div className="flex-1" />
        <div className="flex items-center h-9 pl-1.5 pr-3 rounded-full bg-ink-800 border border-ink-500 shadow-card">
          <Amount icon="coin" raw size="sm" value={Math.floor(state.coins)} />
        </div>
      </div>

      {showResources && (
        <div className="grid grid-cols-4 gap-1.5">
          {RESOURCES.map((r) => {
            const full = state.resources[r.id] >= rates.capacity;
            const perHour = rates.productionPerHour[r.id];

            return (
              <div key={r.id} className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-ink-800 border border-ink-500/70">
                <GameIcon id={r.id} size={20} title={r.name} />
                <div className="flex flex-col leading-none min-w-0">
                  <span className={clsx("text-small font-extrabold", full && "text-blood-400")}>{compact(state.resources[r.id])}</span>
                  <span className={clsx("text-[10px] font-bold", perHour < 0 ? "text-blood-400" : "text-moss-400")}>
                    {perHour >= 0 ? "+" : ""}
                    {compact(perHour)}/h
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
