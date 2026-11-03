"use client";
import { useEffect, useState } from "react";

import { Card, fmt } from "./shared";
import { BattleSummary } from "./BattleSummary";

import { Drawer } from "@/components/molecules/Drawer";
import { BattleReport, RESOURCES, useGame } from "@/context";
import { apiRequest } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { EmptyState } from "@/components/atoms/Ui";
import { GameIcon } from "@/components/atoms/GameIcon";
import { shownXY } from "@/lib/game/config";

type Item = {
  id: number;
  at: number;
  role: "attacker" | "defender";
  won: boolean;
  opponent: string;
  opponentId: number | null;
  /** Their village on the map (older servers don't send it). */
  opponentAt?: { x: number; y: number } | null;
  campLevel: number | null;
  report: BattleReport;
};

/** "📍 120, 87": where a village is, so you know which player it was. */
const Place = ({ at }: { at: { x: number; y: number } }) => (
  <span className="inline-flex items-center gap-0.5 text-goldtext font-bold tabular-nums">
    <GameIcon e="📍" />
    {shownXY(at)}
  </span>
);

/** `onShowOnMap`: jump to a player's village on the map. */
export const ReportsTab = ({ onShowOnMap }: { onShowOnMap?: (playerId: number) => void }) => {
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
              <div className="text-[30px] leading-none">
                <GameIcon e={it.report.ambush ? "🗡️" : it.role === "defender" ? "🛡️" : "⚔️"} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">
                  {it.report.ambush
                    ? "Bandits ambushed your army"
                    : it.role === "attacker"
                      ? `You attacked ${it.opponent}`
                      : `${it.opponent} attacked you`}
                </div>
                <div className="text-xs text-muted">
                  {it.opponentAt && !it.report.ambush && (
                    <>
                      <Place at={it.opponentAt} />{" · "}
                    </>
                  )}
                  {formatDuration(now - it.at)} ago
                  {loot > 0 && ` · ${it.role === "attacker" ? "+" : "−"}${fmt(loot)} resources`}
                </div>
              </div>
              <span className={it.won ? "pill pill-good" : "pill pill-bad"}>
                {it.report.ambush ? (it.won ? "Drove off" : "Beaten") : it.won ? "Won" : "Lost"}
              </span>
            </Card>
          </button>
        );
      })}
      <Drawer isOpen={!!open} position="bottom" onClose={() => setOpen(null)}>
        {open && (
          <div className="flex flex-col gap-3">
            {open.opponentAt && open.opponentId != null && !open.report.ambush && (
              <button
                className="btn btn-wood btn-sm self-center"
                onClick={() => {
                  setOpen(null);
                  onShowOnMap?.(open.opponentId!);
                }}
              >
                <GameIcon e="📍" /> {open.opponent}&apos;s village at {shownXY(open.opponentAt)}: show on map
              </button>
            )}
            <BattleSummary asDefender={open.role === "defender"} report={open.report} />
          </div>
        )}
      </Drawer>
    </div>
  );
};
