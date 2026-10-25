"use client";
import Image from "next/image";

import { ArmyLine, UnitIcon, fmt } from "./shared";
import { RANK_METAL, TroopPortrait } from "./TroopPortrait";

import { Button, Drawer } from "@/components";
import { BattleReport, RESOURCES, useGame } from "@/context";
import { formatDuration } from "@/lib/format";
import { armySize } from "@/lib/game/war";
import { RANKS, UNITS, UNIT_BY_ID } from "@/lib/game/config";

export const BattleSummary = ({ report, asDefender = false }: { report: BattleReport; asDefender?: boolean }) => {
  const won = asDefender ? !report.attackerWon : report.attackerWon;
  const lootTotal = RESOURCES.reduce((s, r) => s + (report.loot[r.id] ?? 0), 0);
  const xp = asDefender ? report.defenderXp : report.attackerXp;
  const promoted = (asDefender ? report.defenderPromoted : report.attackerPromoted) ?? [];
  const earned = UNITS.filter((u) => (xp?.[u.id] ?? 0) > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <div className="text-5xl">{won ? "🏆" : "💀"}</div>
        <div className={won ? "text-2xl font-black text-good" : "text-2xl font-black text-[#F08A6C]"}>
          {won ? "Victory!" : "Defeat"}
        </div>
        <div className="text-sm text-[#B19C80]">
          {report.attackerName} ⚔️ {report.defenderName}
        </div>
      </div>
      <div className="grid grid-cols-3 text-center bg-[#1E1610] rounded p-2 text-sm">
        <div>
          <div className="text-[10px] text-[#B19C80]">ATTACK</div>
          <b>{fmt(report.attack)}</b>
        </div>
        <div>
          <div className="text-[10px] text-[#B19C80]">DEFENSE</div>
          <b>{fmt(report.defense)}</b>
        </div>
        <div>
          <div className="text-[10px] text-[#B19C80]">LUCK</div>
          <b>{report.luck >= 1 ? "+" : ""}{Math.round((report.luck - 1) * 100)}%</b>
        </div>
      </div>
      <div className="text-sm flex flex-col gap-1">
        <div>
          <span className="text-[#B19C80]">Attackers sent: </span>
          <ArmyLine army={report.sent} />
        </div>
        <div>
          <span className="text-[#B19C80]">Attackers lost: </span>
          <ArmyLine army={report.attackerLosses} />
        </div>
        {armySize(report.attackerHealed) > 0 && (
          <div>
            <span className="text-[#B19C80]">Saved by hospital: </span>
            <ArmyLine army={report.attackerHealed} />
          </div>
        )}
        {armySize(report.defenders) > 0 && (
          <div>
            <span className="text-[#B19C80]">Defenders lost: </span>
            <ArmyLine army={report.defenderLosses} />
          </div>
        )}
      </div>
      {promoted.map((p) => {
        const metal = RANK_METAL[p.rank];

        return (
          <div
            key={p.unit}
            className="flex items-center gap-3 rounded-xl p-2 border"
            style={{ borderColor: metal.mid, background: `linear-gradient(90deg, ${metal.dark}66, transparent)` }}
          >
            <TroopPortrait rank={p.rank} size={48} unit={p.unit} />
            <div>
              <div className="text-[10px] tracking-wider text-muted">PROMOTED</div>
              <div className="font-display font-bold" style={{ color: metal.label }}>
                {UNIT_BY_ID[p.unit].name}s are now {RANKS[p.rank].name}s
              </div>
            </div>
          </div>
        );
      })}
      {earned.length > 0 && (
        <div className="bg-[#1E1610] rounded p-2">
          <div className="text-[10px] text-[#B19C80] mb-1">BATTLE EXPERIENCE</div>
          <div className="flex flex-wrap gap-x-3 text-sm">
            {earned.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1">
                <UnitIcon unit={u.id} /> <b className="text-good">+{fmt(xp![u.id])}</b> XP
              </span>
            ))}
          </div>
        </div>
      )}
      {lootTotal > 0 || report.coins > 0 ? (
        <div className="bg-[#1E1610] rounded p-2">
          <div className="text-[10px] text-[#B19C80] mb-1">{asDefender ? "STOLEN FROM YOU" : "LOOT"}</div>
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
            <p className="text-center text-sm text-[#B19C80]">
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
