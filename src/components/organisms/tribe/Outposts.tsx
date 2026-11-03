"use client";
import { useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import { RESOURCES, useGame } from "@/context";
import { OUTPOST } from "@/lib/game/config";
import { fieldUpgradeInfo, outpostBlocked, outpostCost, outpostSlots } from "@/lib/game/engine";
import { compact, formatDuration } from "@/lib/format";
import { Bar } from "@/components/atoms/Ui";
import { GameIcon } from "@/components/atoms/GameIcon";
import { InfoDrawer } from "@/components/organisms/InfoDrawer";

/**
 * The tribe's outposts (see OUTPOST): each with four resource fields and its
 * own builder, feeding the home stores, and the button to found the next one.
 */
export const Outposts = () => {
  const { state, now, foundOutpost, upgradeField } = useGame();
  const [busy, setBusy] = useState<string | null>(null);
  const slots = outpostSlots(state);
  const blocked = outpostBlocked(state);
  const cost = outpostCost(state);
  const run = async (key: string, fn: () => Promise<boolean>) => {
    setBusy(key);
    await fn();
    setBusy(null);
  };

  return (
    <section className="flex flex-col gap-2.5 min-w-0">
      <div className="flex items-center gap-2">
        <GameIcon e="🏕️" />
        <h2 className="title-section flex-1">Outposts</h2>
        <span className="text-xs font-bold text-muted tabular-nums">
          {state.outposts.length} of {slots}
        </span>
        <InfoDrawer
          content={`Found outposts on free land near your village: each has its own iron, wood, clay and crop fields (up to level ${OUTPOST.fieldMaxLevel}) and its own builder, and sends everything home. Town Hall ${OUTPOST.hallLevels.join(", ")} each allow one more. Outposts can't be attacked.`}
          title="Outposts"
        />
      </div>

      {state.outposts.map((o, i) => (
        <div key={`${o.x},${o.y}`} className="card-flat rounded-xl p-2.5 flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold">Outpost {i + 1}</span>
            <span className="text-xs text-muted">
              {o.job ? `Raising ${o.job.resource} to ${o.job.toLevel} · ${formatDuration(o.job.endsAt - now)}` : "Builder free"}
            </span>
          </div>
          {o.job && <Bar className="!h-1.5" max={o.job.endsAt - o.job.startedAt} value={now - o.job.startedAt} />}
          <div className="grid grid-cols-4 gap-1.5">
            {RESOURCES.map((r) => {
              const info = fieldUpgradeInfo(state, i, r.id);
              const short = RESOURCES.some((x) => state.resources[x.id] < info.cost[x.id]);
              const can = !info.blocked && !short;

              return (
                <button
                  key={r.id}
                  className={clsx("inset flex flex-col items-center gap-0.5 py-1.5 rounded-lg", can ? "border border-gold/60" : "opacity-80")}
                  disabled={!can || busy != null}
                  title={info.blocked ?? (short ? "Not enough resources" : `Costs ${compact(info.cost.iron)}+ each`)}
                  onClick={() => run(`${i}-${r.id}`, () => upgradeField(i, r.id))}
                >
                  <Image alt={r.name} className="w-6 h-6 object-contain" src={r.img} />
                  <span className="text-xs font-extrabold tabular-nums">{o.fields[r.id]}</span>
                  <span className="text-[10px] text-muted leading-none">
                    {info.from >= OUTPOST.fieldMaxLevel ? "max" : can ? "raise" : short ? compact(info.cost[r.id]) : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {state.outposts.length < OUTPOST.hallLevels.length && (
        <div className="card-flat rounded-xl p-2.5 flex items-center gap-3">
          <div className="flex-1 min-w-0 text-xs text-sub">
            {blocked ?? (
              <>
                Costs {compact(cost.resources.iron)} of each resource and {compact(cost.people)} people.
              </>
            )}
          </div>
          <button className="btn btn-sm btn-gold shrink-0" disabled={!!blocked || busy != null} onClick={() => run("found", foundOutpost)}>
            {busy === "found" ? "Settling…" : "Found outpost"}
          </button>
        </div>
      )}
    </section>
  );
};
