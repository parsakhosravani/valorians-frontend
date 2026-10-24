"use client";
import { ArmyLine, fmt } from "./shared";

import { Amount, Button, Card, Overline, Sheet, Stat } from "@/components/ui";
import { GameIcon } from "@/art";
import { BattleReport, RESOURCES, useGame } from "@/context";
import { formatDuration } from "@/lib/format";
import { armySize } from "@/lib/game/war";

export const BattleSummary = ({ report, asDefender = false }: { report: BattleReport; asDefender?: boolean }) => {
  const won = asDefender ? !report.attackerWon : report.attackerWon;
  const lootTotal = RESOURCES.reduce((s, r) => s + (report.loot[r.id] ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center text-center gap-1 pt-1">
        <span className={won ? "drop-shadow-[0_0_24px_rgba(240,190,90,0.55)]" : "grayscale opacity-80"}>
          <GameIcon id={won ? "trophy" : "defense"} size={64} />
        </span>
        <div className={won ? "font-display font-extrabold text-display-xl text-gold-300" : "font-display font-extrabold text-display-xl text-blood-400"}>
          {won ? "Victory!" : "Defeat"}
        </div>
        <div className="text-small font-bold text-parch-500">
          {report.attackerName} vs {report.defenderName}
        </div>
      </div>
      <Card className="grid grid-cols-3 gap-1" tone="sunken">
        <Stat label="Attack" value={fmt(report.attack)} />
        <Stat label="Defense" value={fmt(report.defense)} />
        <Stat label="Luck" value={`${report.luck >= 1 ? "+" : ""}${Math.round((report.luck - 1) * 100)}%`} />
      </Card>
      <div className="flex flex-col gap-1.5 text-small">
        <div className="flex justify-between gap-2">
          <span className="text-parch-500 font-bold">Attackers sent</span>
          <ArmyLine army={report.sent} />
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-parch-500 font-bold">Attackers lost</span>
          <ArmyLine army={report.attackerLosses} />
        </div>
        {armySize(report.attackerHealed) > 0 && (
          <div className="flex justify-between gap-2">
            <span className="text-parch-500 font-bold">Saved by hospital</span>
            <ArmyLine army={report.attackerHealed} />
          </div>
        )}
        {armySize(report.defenders) > 0 && (
          <div className="flex justify-between gap-2">
            <span className="text-parch-500 font-bold">Defenders lost</span>
            <ArmyLine army={report.defenderLosses} />
          </div>
        )}
      </div>
      {lootTotal > 0 || report.coins > 0 ? (
        <Card className="flex flex-col gap-1.5" tone={asDefender ? "danger" : "gold"}>
          <Overline>{asDefender ? "Stolen from you" : "Loot"}</Overline>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {RESOURCES.map((r) => (
              <Amount key={r.id} icon={r.id} value={report.loot[r.id] ?? 0} />
            ))}
            {report.coins > 0 && <Amount icon="coin" value={report.coins} />}
          </div>
        </Card>
      ) : null}
    </div>
  );
};

export const BattleResultDrawer = ({ report, onClose }: { report: BattleReport | null; onClose: () => void }) => {
  const { now } = useGame();
  const home = report && armySize(report.sent) - armySize(report.attackerLosses) > 0;

  return (
    <Sheet open={!!report} title="Battle report" onClose={onClose}>
      {report && (
        <div className="flex flex-col gap-3">
          <BattleSummary report={report} />
          {home && (
            <p className="text-center text-small text-parch-500">
              Your army returns in {formatDuration(report.returnsAt - now)}
              {report.attackerWon ? " with the loot" : ""}.
            </p>
          )}
          <Button full size="lg" onClick={onClose}>
            Continue
          </Button>
        </div>
      )}
    </Sheet>
  );
};
