"use client";
import { useEffect, useState } from "react";

import { fmt } from "./shared";
import { BattleSummary } from "./BattleResultDrawer";

import { Badge, Card, Empty, Icon, Sheet, Spinner } from "@/components/ui";
import { GameIcon } from "@/art";
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
      {!items && <Spinner />}
      {items?.length === 0 && <Empty title="No battles yet">Raid a tribe or a barbarian camp and the report shows up here.</Empty>}
      {items?.map((it) => {
        const loot = RESOURCES.reduce((s, r) => s + (it.report.loot[r.id] ?? 0), 0);

        return (
          <Card key={it.id} className="flex items-center gap-3" onClick={() => setOpen(it)}>
            <span className="w-10 h-10 rounded-xl bg-ink-700 border border-ink-500 flex items-center justify-center shrink-0">
              <GameIcon id={it.role === "defender" ? "defense" : "attack"} size={24} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{it.role === "attacker" ? `You attacked ${it.opponent}` : `${it.opponent} attacked you`}</div>
              <div className="text-caption font-bold text-parch-500">
                {formatDuration(now - it.at)} ago
                {loot > 0 && ` · ${it.role === "attacker" ? "+" : "−"}${fmt(loot)} resources`}
              </div>
            </div>
            <Badge tone={it.won ? "moss" : "ember"}>{it.won ? "Won" : "Lost"}</Badge>
            <Icon className="text-parch-500" name="chevron" size={18} />
          </Card>
        );
      })}
      <Sheet open={!!open} title="Battle report" onClose={() => setOpen(null)}>
        {open && <BattleSummary asDefender={open.role === "defender"} report={open.report} />}
      </Sheet>
    </div>
  );
};
