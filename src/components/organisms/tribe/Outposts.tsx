"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";

import { RESOURCES, useGame, useGameStatus } from "@/context";
import { OUTPOST, ResourceId } from "@/lib/game/config";
import { fieldUpgradeInfo, outpostBlocked, outpostCost, outpostOutput, outpostSlots } from "@/lib/game/engine";
import type { OutpostLand, OutpostSpot } from "@/lib/game/outpost";
import { apiRequest } from "@/lib/api";
import { compact, formatDuration } from "@/lib/format";
import { Bar } from "@/components/atoms/Ui";
import { GameIcon } from "@/components/atoms/GameIcon";
import { InfoDrawer } from "@/components/organisms/InfoDrawer";

/** What players call the land that favours each resource. */
const LAND_NAME: Record<ResourceId, string> = { wood: "Woodland", clay: "Hill land", iron: "Rocky land", crop: "Farmland" };
const res = (id: ResourceId) => RESOURCES.find((r) => r.id === id)!;
/** Its own picture (not a small Town Hall), with what its land favours on a badge. */
const OUTPOST_IMG = "/images/buildings/Outpost.webp";

const OutpostPicture = ({ land, dim }: { land?: OutpostLand; dim?: boolean }) => (
  <span className="relative shrink-0 w-14 h-14">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img alt="Outpost" className={clsx("w-14 h-14 object-contain drop-shadow-[0_3px_4px_rgba(0,0,0,0.6)]", dim && "grayscale opacity-50")} src={OUTPOST_IMG} />
    {land && (
      <span className="absolute -bottom-0.5 -left-0.5 w-6 h-6 rounded-full bg-ink border border-gold/70 flex items-center justify-center">
        <Image alt={res(land.resource).name} className="w-4 h-4 object-contain" src={res(land.resource).img} />
      </span>
    )}
  </span>
);

/** "+30% wood · Woodland", with the resource's icon. */
const LandChip = ({ land }: { land: OutpostLand }) => (
  <span className="inline-flex items-center gap-1 text-xs text-gold font-bold">
    <Image alt={res(land.resource).name} className="w-4 h-4 object-contain" src={res(land.resource).img} />
    +{land.percent}% {res(land.resource).name.toLowerCase()}
    <span className="text-muted font-normal">· {LAND_NAME[land.resource]}</span>
  </span>
);

/**
 * The tribe's outposts (see OUTPOST): each with four resource fields, its own
 * builder and a land bonus from where it stands, feeding the home stores; and
 * founding the next one on a spot the player picks.
 */
export const Outposts = () => {
  const { state, now, foundOutpost, upgradeField } = useGame();
  const { authHeader } = useGameStatus();
  const [busy, setBusy] = useState<string | null>(null);
  // The field tapped on each outpost, to show its cost and the Raise button.
  const [open, setOpen] = useState<Record<number, ResourceId | undefined>>({});
  // Spots offered for the next outpost (null: not asked yet).
  const [spots, setSpots] = useState<OutpostSpot[] | null>(null);
  const slots = outpostSlots(state);
  const blocked = outpostBlocked(state);
  const cost = outpostCost(state);
  // Everything the outposts send home each hour.
  const total = state.outposts.reduce((n, o) => {
    const out = outpostOutput(o);

    return n + RESOURCES.reduce((m, r) => m + out[r.id], 0);
  }, 0);
  const run = async (key: string, fn: () => Promise<boolean>) => {
    setBusy(key);
    const ok = await fn();

    setBusy(null);

    return ok;
  };
  const chooseSpot = async () => {
    if (!authHeader) return;
    setBusy("spots");
    try {
      setSpots((await apiRequest<{ spots: OutpostSpot[] }>(authHeader, "outposts/spots")).spots);
    } catch {
      setSpots([]);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-2.5 min-w-0">
      <div className="flex items-center gap-2">
        <GameIcon e="🏕️" />
        <h2 className="title-section flex-1">Outposts</h2>
        {total > 0 && <span className="text-xs font-bold text-good tabular-nums">+{compact(total)}/h home</span>}
        <span className="text-xs font-bold text-muted tabular-nums">
          {state.outposts.length} of {slots}
        </span>
        <InfoDrawer
          content={`Found outposts on free land near your village: each has its own iron, wood, clay and crop fields (up to level ${OUTPOST.fieldMaxLevel}) and its own builder, and sends everything home. The land round an outpost favours one resource: woods give wood, hills clay, rocky ground iron, open fields and water crop, +${OUTPOST.landBonusPerTile}% for each tile of it, up to +${OUTPOST.landBonusMax}%. You choose where to settle. Town Hall ${OUTPOST.hallLevels.join(", ")} each allow one more. Outposts can't be attacked.`}
          title="Outposts"
        />
      </div>

      {state.outposts.map((o, i) => {
        const out = outpostOutput(o);
        const perHour = RESOURCES.reduce((n, r) => n + out[r.id], 0);
        const picked = open[i];
        const info = picked ? fieldUpgradeInfo(state, i, picked) : null;
        const short = info ? RESOURCES.filter((x) => state.resources[x.id] < info.cost[x.id]).map((x) => x.id) : [];

        return (
          <div key={`${o.x},${o.y}`} className="card-flat rounded-xl p-2.5 flex flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <OutpostPicture land={o.land} />
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="font-display font-bold text-sm text-parch truncate">
                  {o.land ? `${LAND_NAME[o.land.resource]} outpost` : `Outpost ${i + 1}`}
                </span>
                {o.land && <LandChip land={o.land} />}
                <span className="text-[11px] text-muted">
                  {o.job ? (
                    <>
                      <GameIcon e="🔨" /> {res(o.job.resource).name} field → {o.job.toLevel} · {formatDuration(o.job.endsAt - now)}
                    </>
                  ) : (
                    "Builder free: tap a field to raise it"
                  )}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={clsx("text-sm font-extrabold tabular-nums", perHour > 0 ? "text-good" : "text-muted")}>
                  {perHour > 0 ? `+${compact(perHour)}/h` : o.job ? "First field soon" : "No fields yet"}
                </span>
                <Link aria-label="Show on the map" className="btn btn-wood btn-sm !px-2 text-xs" href="/battle?tab=map">
                  <GameIcon e="📍" /> Map
                </Link>
              </div>
            </div>
            {o.job && <Bar className="!h-1.5" max={o.job.endsAt - o.job.startedAt} value={now - o.job.startedAt} />}
            <div className="grid grid-cols-4 gap-1.5">
              {RESOURCES.map((r) => {
                const level = o.fields[r.id] ?? 0;
                const bonus = o.land?.resource === r.id;

                return (
                  <button
                    key={r.id}
                    className={clsx(
                      "inset relative flex flex-col items-center gap-0.5 py-1.5 rounded-lg border",
                      picked === r.id ? "border-gold" : bonus ? "border-gold/40" : "border-transparent"
                    )}
                    onClick={() => setOpen((m) => ({ ...m, [i]: m[i] === r.id ? undefined : r.id }))}
                  >
                    <Image alt={r.name} className="w-6 h-6 object-contain" src={r.img} />
                    <span className="text-xs font-extrabold tabular-nums">{level >= OUTPOST.fieldMaxLevel ? "max" : `Lv ${level}`}</span>
                    <span className="text-[10px] text-muted leading-none tabular-nums">+{compact(out[r.id])}/h</span>
                  </button>
                );
              })}
            </div>
            {picked && info && (
              <div className="inset rounded-lg p-2 flex items-center gap-2">
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  {info.from >= OUTPOST.fieldMaxLevel ? (
                    <span className="text-xs text-sub">This field is at its top.</span>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
                        {RESOURCES.map((x) => (
                          <span key={x.id} className={clsx("inline-flex items-center gap-0.5 text-xs tabular-nums", short.includes(x.id) ? "text-bad" : "text-sub")}>
                            <Image alt={x.name} className="w-3.5 h-3.5 object-contain" src={x.img} />
                            {compact(info.cost[x.id])}
                          </span>
                        ))}
                      </div>
                      <span className="text-[11px] text-muted">
                        <GameIcon e="⏳" /> {formatDuration(info.seconds * 1000)}
                        {info.blocked ? ` · ${info.blocked}` : ""}
                      </span>
                    </>
                  )}
                </div>
                {info.from < OUTPOST.fieldMaxLevel && (
                  <button
                    className="btn btn-sm btn-gold shrink-0"
                    disabled={!!info.blocked || short.length > 0 || busy != null}
                    onClick={() => run(`${i}-${picked}`, () => upgradeField(i, picked))}
                  >
                    {busy === `${i}-${picked}` ? "…" : `Raise to ${info.from + 1}`}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {state.outposts.length < OUTPOST.hallLevels.length && (
        <div className={clsx("rounded-xl p-2.5 flex flex-col gap-2 border border-dashed", blocked ? "border-line" : "border-gold/50")}>
          <div className="flex items-center gap-2.5">
            <OutpostPicture dim={!!blocked} />
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="font-display font-bold text-sm text-parch">New outpost</span>
              <span className="text-xs text-sub">
                {blocked ?? (
                  <>
                    Costs {compact(cost.resources.iron)} of each resource and {compact(cost.people)} people.
                  </>
                )}
              </span>
            </div>
            {spots == null && (
              <button className="btn btn-sm btn-gold shrink-0" disabled={!!blocked || busy != null} onClick={chooseSpot}>
                {busy === "spots" ? "Looking…" : "Found outpost"}
              </button>
            )}
          </div>
          {spots != null && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-sub">Choose the land to settle</span>
              {spots.length === 0 && <span className="text-xs text-muted">No free land near your village.</span>}
              {spots.map((p) => (
                <div key={`${p.x},${p.y}`} className="inset rounded-lg p-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <LandChip land={p.land} />
                    <span className="text-[11px] text-muted">{Math.round(p.distance)} tiles from home</span>
                  </div>
                  <button
                    className="btn btn-sm btn-gold shrink-0"
                    disabled={!!blocked || busy != null}
                    onClick={async () => {
                      if (await run(`found-${p.x},${p.y}`, () => foundOutpost(p))) setSpots(null);
                      else chooseSpot(); // taken meanwhile: offer fresh spots
                    }}
                  >
                    {busy === `found-${p.x},${p.y}` ? "Settling…" : "Settle"}
                  </button>
                </div>
              ))}
              <button className="text-xs text-muted self-end" onClick={() => setSpots(null)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
