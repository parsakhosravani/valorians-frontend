"use client";
import Image from "next/image";

import { ArmyLine, fmt } from "./shared";

import { Button, Drawer } from "@/components";
import { BattleReport, RESOURCES, useGame } from "@/context";
import { formatDuration } from "@/lib/format";
import { armySize } from "@/lib/game/war";

export const BattleSummary = ({ report, asDefender = false }: { report: BattleReport; asDefender?: boolean }) => {
  const won = asDefender ? !report.attackerWon : report.attackerWon;
  const lootTotal = RESOURCES.reduce((s, r) => s + (report.loot[r.id] ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <div className="text-5xl">{won ? "🏆" : "💀"}</div>
        <div className={won ? "text-2xl font-black text-green-400" : "text-2xl font-black text-[#F72214]"}>
          {won ? "Victory!" : "Defeat"}
        </div>
        <div className="text-sm text-[#B5C7DE]">
          {report.attackerName} ⚔️ {report.defenderName}
        </div>
      </div>
      <div className="grid grid-cols-3 text-center bg-[#212F42] rounded p-2 text-sm">
        <div>
          <div className="text-[10px] text-[#B5C7DE]">ATTACK</div>
          <b>{fmt(report.attack)}</b>
        </div>
        <div>
          <div className="text-[10px] text-[#B5C7DE]">DEFENSE</div>
          <b>{fmt(report.defense)}</b>
        </div>
        <div>
          <div className="text-[10px] text-[#B5C7DE]">LUCK</div>
          <b>{report.luck >= 1 ? "+" : ""}{Math.round((report.luck - 1) * 100)}%</b>
        </div>
      </div>
      <div className="text-sm flex flex-col gap-1">
        <div>
          <span className="text-[#B5C7DE]">Attackers sent: </span>
          <ArmyLine army={report.sent} />
        </div>
        <div>
          <span className="text-[#B5C7DE]">Attackers lost: </span>
          <ArmyLine army={report.attackerLosses} />
        </div>
        {armySize(report.attackerHealed) > 0 && (
          <div>
            <span className="text-[#B5C7DE]">Saved by hospital: </span>
            <ArmyLine army={report.attackerHealed} />
          </div>
        )}
        {armySize(report.defenders) > 0 && (
          <div>
            <span className="text-[#B5C7DE]">Defenders lost: </span>
            <ArmyLine army={report.defenderLosses} />
          </div>
        )}
      </div>
      {lootTotal > 0 || report.coins > 0 ? (
        <div className="bg-[#212F42] rounded p-2">
          <div className="text-[10px] text-[#B5C7DE] mb-1">{asDefender ? "STOLEN FROM YOU" : "LOOT"}</div>
          <div className="flex flex-wrap gap-x-3 text-sm">
            {RESOURCES.map((r) => (
              <span key={r.id} className="flex items-center gap-1">
                <Image alt={r.name} className="h-4 w-4" src={r.img} />
                {fmt(report.loot[r.id] ?? 0)}
              </span>
            ))}
            {report.coins > 0 && <span>🪙 {fmt(report.coins)}</span>}
          </div>
        </div>
      ) : null}
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
            <p className="text-center text-sm text-[#B5C7DE]">
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
