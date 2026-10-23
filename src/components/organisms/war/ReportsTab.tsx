"use client";
import { useEffect, useState } from "react";

import { Card, fmt } from "./shared";
import { BattleSummary } from "./BattleResultDrawer";

import { Drawer } from "@/components";
import { BattleReport, RESOURCES, useGame } from "@/context";
import { apiRequest } from "@/lib/api";
import { formatDuration } from "@/lib/format";

type Item = {
  id: number;
  at: number;
  role: "attacker" | "defender";
  won: boolean;
  opponent: string;
  campLevel: number | null;
  report: BattleReport;
};

export const ReportsTab = () => {
  const { authHeader, now } = useGame();
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState<Item | null>(null);

  useEffect(() => {
    if (!authHeader) return;
    apiRequest<{ reports: Item[] }>(authHeader, "war/reports")
      .then((r) => setItems(r.reports))
      .catch(() => setItems([]));
  }, [authHeader]);

  return (
    <div className="flex flex-col gap-2">
      {!items && <p className="text-sm text-[#B19C80]">Loading…</p>}
      {items?.length === 0 && <p className="text-sm text-[#B19C80]">No battles yet.</p>}
      {items?.map((it) => {
        const loot = RESOURCES.reduce((s, r) => s + (it.report.loot[r.id] ?? 0), 0);

        return (
          <button key={it.id} className="text-left" onClick={() => setOpen(it)}>
            <Card className="flex items-center gap-3">
              <div className="text-2xl">{it.role === "defender" ? "🛡️" : "⚔️"}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">
                  {it.role === "attacker" ? `You attacked ${it.opponent}` : `${it.opponent} attacked you`}
                </div>
                <div className="text-xs text-[#B19C80]">
                  {formatDuration(now - it.at)} ago
                  {loot > 0 && ` · ${it.role === "attacker" ? "+" : "−"}${fmt(loot)} resources`}
                </div>
              </div>
              <span className={it.won ? "text-good font-bold text-sm" : "text-[#F08A6C] font-bold text-sm"}>
                {it.won ? "Won" : "Lost"}
              </span>
            </Card>
          </button>
        );
      })}
      <Drawer isOpen={!!open} position="bottom" onClose={() => setOpen(null)}>
        {open && <BattleSummary asDefender={open.role === "defender"} report={open.report} />}
      </Drawer>
    </div>
  );
};
