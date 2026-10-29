"use client";
import Image from "next/image";

import { ArmyLine, fmt } from "./shared";

import { Button } from "@/components/atoms/Button";
import { Drawer } from "@/components/molecules/Drawer";
import { BattleReport, RESOURCES, useGame } from "@/context";
import { formatDuration } from "@/lib/format";
import { armySize } from "@/lib/game/war";
import { RANKS, unitPlural } from "@/lib/game/config";
import { GameIcon } from "@/components/atoms/GameIcon";

export const BattleSummary = ({ report, asDefender = false }: { report: BattleReport; asDefender?: boolean }) => {
  const won = asDefender ? !report.attackerWon : report.attackerWon;
  const lootTotal = RESOURCES.reduce((s, r) => s + (report.loot[r.id] ?? 0), 0);
  const xp = asDefender ? report.defenderXp : report.attackerXp;
  const promoted = (asDefender ? report.defenderPromoted : report.attackerPromoted) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <div className="text-[56px] leading-none drop-shadow-[0_6px_14px_rgba(0,0,0,0.6)]"><GameIcon e={won ? "🏆" : "💀"} /></div>
        <div className={won ? "font-display text-[26px] font-black text-good mt-1" : "font-display text-[26px] font-black text-bad mt-1"}>
          {won ? "Victory!" : "Defeat"}
        </div>
        <div className="text-sm text-muted">
          {report.attackerName} <GameIcon e="⚔️" /> {report.defenderName}
        </div>
        {report.battleMs != null && report.rounds?.length ? (
          <div className="text-xs text-muted">
            Fought over {report.rounds.length} rounds · {formatDuration(report.battleMs)}
          </div>
        ) : null}
      </div>
      <div className="inset grid grid-cols-3 divide-x divide-line/50 text-center py-2 text-sm">
        <div>
          <div className="label !text-micro">ATTACK</div>
          <b>{fmt(report.attack)}</b>
        </div>
        <div>
          <div className="label !text-micro">DEFENSE</div>
          <b>{fmt(report.defense)}</b>
        </div>
        <div>
          <div className="label !text-micro">LUCK</div>
          <b>{report.luck >= 1 ? "+" : ""}{Math.round((report.luck - 1) * 100)}%</b>
        </div>
      </div>
      <div className="text-sm flex flex-col gap-1">
        <div>
          <span className="text-muted">Attackers sent: </span>
          <ArmyLine army={report.sent} />
        </div>
        <div>
          <span className="text-muted">Attackers lost: </span>
          <ArmyLine army={report.attackerLosses} />
        </div>
        {armySize(report.attackerHealed) > 0 && (
          <div>
            <span className="text-muted">Saved by hospital: </span>
            <ArmyLine army={report.attackerHealed} />
          </div>
        )}
        {armySize(report.defenders) > 0 && (
          <div>
            <span className="text-muted">Defenders lost: </span>
            <ArmyLine army={report.defenderLosses} />
          </div>
        )}
      </div>
      {xp && armySize(xp) > 0 && (
        <div className="text-sm">
          <span className="text-muted">Experience: </span>
          <ArmyLine army={xp} /> <span className="text-muted">XP</span>
        </div>
      )}
      {promoted.map((p) => (
        <div key={p.unit} className="text-center font-bold text-gold">
          <GameIcon e="🎖️" /> {unitPlural(p.unit)} promoted to {RANKS[p.rank].name}!
        </div>
      ))}
      {lootTotal > 0 || report.coins > 0 ? (
        <div className="inset p-2.5">
          <div className="label !text-micro mb-1">{asDefender ? "Stolen from you" : "Loot"}</div>
          <div className="flex flex-wrap gap-x-3 text-sm">
            {RESOURCES.map((r) => (
              <span key={r.id} className="flex items-center gap-1">
                <Image alt={r.name} className="h-4 w-4" src={r.img} />
                {fmt(report.loot[r.id] ?? 0)}
              </span>
            ))}
            {report.coins > 0 && <span><GameIcon e="🪙" /> {fmt(report.coins)}</span>}
          </div>
        </div>
      ) : null}
      {!asDefender && report.carried && (RESOURCES.some((r) => (report.carried?.[r.id] ?? 0) > 0) || !!report.carriedCoins) && (
        <div className={report.attackerWon ? "text-xs text-sub" : "text-xs text-bad"}>
          <GameIcon e="🎒" /> {report.attackerWon ? "Also bringing home" : "Lost on the field"} the spoils carried from the last battle:{" "}
          {RESOURCES.filter((r) => (report.carried?.[r.id] ?? 0) > 0)
            .map((r) => `${fmt(report.carried![r.id])} ${r.name.toLowerCase()}`)
            .join(", ")}
          {report.carriedCoins ? `, ${fmt(report.carriedCoins)} coins` : ""}.
        </div>
      )}
    </div>
  );
};

export const BattleResultDrawer = ({ report, onClose }: { report: BattleReport | null; onClose: () => void }) => {
  const { now } = useGame();
  const home = report && armySize(report.sent) - armySize(report.attackerLosses) > 0;

  return (
    <Drawer isOpen={!!report} position="bottom" onClose={onClose}>
      {report && (
        <div className="flex flex-col gap-3">
          <BattleSummary report={report} />
          {home && (
            <p className="text-center text-sm text-muted">
              Your army returns in {formatDuration(report.returnsAt - now)}
              {report.attackerWon ? " with the loot" : ""}.
            </p>
          )}
          <Button isFull onClick={onClose}>
            OK
          </Button>
        </div>
      )}
    </Drawer>
  );
};
