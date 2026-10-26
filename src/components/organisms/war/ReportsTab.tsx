"use client";
import { useEffect, useState } from "react";

import { Card, fmt } from "./shared";
import { BattleSummary } from "./BattleResultDrawer";

import { Drawer } from "@/components";
import { BattleReport, RESOURCES, useGame } from "@/context";
import { apiRequest } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { EmptyState } from "@/components/atoms/Ui";
import { GameIcon } from "@/components/atoms/GameIcon";

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
      {!items && <p className="text-sm text-muted text-center py-6">Loading…</p>}
      {items?.length === 0 && (
        <EmptyState e="⚔️" title="No battles yet">
          Raid a barbarian camp or a rival tribe from the map. Every fight is recorded here.
        </EmptyState>
      )}
      {items?.map((it) => {
        const loot = RESOURCES.reduce((s, r) => s + (it.report.loot[r.id] ?? 0), 0);

        return (
          <button key={it.id} className="text-left" onClick={() => setOpen(it)}>
            <Card className="flex items-center gap-3">
              <div className="text-[30px] leading-none"><GameIcon e={it.role === "defender" ? "🛡️" : "⚔️"} /></div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">
                  {it.role === "attacker" ? `You attacked ${it.opponent}` : `${it.opponent} attacked you`}
                </div>
                <div className="text-xs text-muted">
                  {formatDuration(now - it.at)} ago
                  {loot > 0 && ` · ${it.role === "attacker" ? "+" : "−"}${fmt(loot)} resources`}
                </div>
              </div>
              <span className={it.won ? "pill pill-good" : "pill pill-bad"}>
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
