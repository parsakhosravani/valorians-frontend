"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";

import { RESOURCES, useGame, useGameStatus } from "@/context";
import { OUTPOST, ResourceId, UNITS } from "@/lib/game/config";
import { Army, emptyArmy, fieldUpgradeInfo, getRates, outpostBlocked, outpostCost, outpostOutput, outpostSlots, outpostWaitMs, ownArmy } from "@/lib/game/engine";
import { garrisonCap, garrisonOf, garrisonRoom, headingTo } from "@/lib/game/garrison";
import { armySize } from "@/lib/game/war";
import { Drawer } from "@/components/molecules/Drawer";
import { Button } from "@/components/atoms/Button";
import { UnitBadge } from "@/components/organisms/war/shared";
import type { OutpostLand, OutpostSpot } from "@/lib/game/outpost";
import { apiRequest } from "@/lib/api";
import { compact, formatDuration } from "@/lib/format";
import { Bar } from "@/components/atoms/Ui";
import { GameIcon } from "@/components/atoms/GameIcon";
import { InfoDrawer } from "@/components/organisms/InfoDrawer";
import population from "~/images/resources/population.webp";

/** What players call the land that favours each resource. */
const LAND_NAME: Record<ResourceId, string> = { wood: "Woodland", clay: "Hill land", iron: "Rocky land", crop: "Farmland" };
const res = (id: ResourceId) => RESOURCES.find((r) => r.id === id)!;
/** Its own picture (the tower icon reads better this small than the wide map camp), with what its land favours on a badge. */
const OUTPOST_IMG = "/images/icons/outpost.webp";

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

/** Troops that can march overland (ships stay in the harbor). */
const MARCHERS = UNITS.filter((u) => !u.transport);

/**
 * Moving troops between the village and an outpost: "station" sends troops
 * from home into its garrison, "home" brings some of the garrison back.
 */
const GarrisonDrawer = ({ open, onClose }: { open: { idx: number; mode: "station" | "home" } | null; onClose: () => void }) => {
  const { state, stationTroops, garrisonHome } = useGame();
  const [units, setUnits] = useState<Army>(emptyArmy());
  const [busy, setBusy] = useState(false);
  const o = open ? state.outposts[open.idx] : undefined;
  const station = open?.mode === "station";
  const have = station ? ownArmy(state) : garrisonOf(o);
  const room = open && station ? garrisonRoom(state, open.idx) : Infinity;
  const list = MARCHERS.filter((u) => have[u.id] > 0);
  const size = armySize(units);
  const setOne = (id: keyof Army, n: number) => setUnits((a) => ({ ...a, [id]: Math.max(0, Math.min(have[id], Math.floor(n || 0))) }));
  const close = () => {
    setUnits(emptyArmy());
    onClose();
  };

  return (
    <Drawer
      isOpen={!!open && !!o}
      position="bottom"
      title={open ? (station ? `Station troops at outpost ${open.idx + 1}` : `Bring troops home from outpost ${open.idx + 1}`) : "Garrison"}
      onClose={close}
    >
      {open && o && (
        <div className="flex flex-col gap-3 pt-2">
          <p className="text-xs text-sub">
            {station
              ? `They march there and stay. From the outpost they can attack (the road is shorter) and come back there. They don't defend your village, and while troops are stationed there the outpost can be attacked: only its garrison defends it. Room for ${room} more.`
              : "They march home and defend your village again."}
          </p>
          {list.length === 0 && <div className="card-flat rounded-xl p-3 text-center text-sm text-sub">{station ? "No troops of your own at home." : "Nobody is stationed here."}</div>}
          {list.map((u) => (
            <div key={u.id} className="flex items-center gap-2 rounded-xl border border-line bg-panel/60 px-2.5 py-2">
              <UnitBadge size={30} unit={u.id} />
              <div className="flex-1 min-w-0 leading-tight">
                <div className="text-sm font-bold truncate">{u.name}</div>
                <div className="text-[10px] text-muted">
                  {compact(have[u.id])} {station ? "at home" : "here"}
                </div>
              </div>
              <div className="flex gap-1">
                {[0.25, 0.5, 1].map((f) => (
                  <button key={f} className="btn btn-wood h-7 px-2 rounded-lg text-[11px] font-extrabold" type="button" onClick={() => setOne(u.id, Math.round(have[u.id] * f))}>
                    {f === 1 ? "All" : f === 0.5 ? "½" : "¼"}
                  </button>
                ))}
              </div>
              <input
                aria-label={`${u.name} to move`}
                className="inset w-14 h-7 rounded-lg text-center text-sm font-extrabold tabular-nums outline-none focus:border-gold"
                inputMode="numeric"
                placeholder="0"
                value={units[u.id] || ""}
                onChange={(e) => setOne(u.id, Number(e.target.value.replace(/\D/g, "")))}
              />
            </div>
          ))}
          {station && size > room && <p className="text-xs text-bad">The outpost has room for {room} more.</p>}
          <Button
            isFull
            disabled={busy || size === 0 || size > room}
            size="large"
            onClick={async () => {
              setBusy(true);
              const ok = station ? await stationTroops(open.idx, units) : await garrisonHome(open.idx, units);

              setBusy(false);
              if (ok) close();
            }}
          >
            {busy ? "Marching…" : size ? `${station ? "Station" : "Bring home"} ${compact(size)} troops` : "Choose troops"}
          </Button>
        </div>
      )}
    </Drawer>
  );
};

/** Garrison line of an outpost card: who's stationed, who's on the way, and the two buttons. */
const GarrisonRow = ({ idx, onMove }: { idx: number; onMove: (mode: "station" | "home") => void }) => {
  const { state } = useGame();
  const o = state.outposts[idx];
  const g = garrisonOf(o);
  const n = armySize(g);
  const coming = armySize(headingTo(state, idx));

  return (
    <div className="inset rounded-lg px-2 py-1.5 flex items-center gap-2">
      <GameIcon e="🛡️" />
      <div className="flex-1 min-w-0 leading-tight">
        <div className="text-xs font-bold tabular-nums">
          Garrison {compact(n)} / {compact(garrisonCap(o))}
          {coming > 0 && <span className="text-muted font-normal"> · {compact(coming)} on the way</span>}
        </div>
        <div className="text-[10px] text-muted truncate">
          {n > 0
            ? MARCHERS.filter((u) => g[u.id] > 0).map((u) => `${compact(g[u.id])} ${u.name}`).join(" · ")
            : "Empty: it can't be attacked"}
        </div>
      </div>
      <button className="btn btn-wood btn-sm !px-2 text-xs shrink-0" onClick={() => onMove("station")}>
        Station
      </button>
      {n > 0 && (
        <button className="btn btn-wood btn-sm !px-2 text-xs shrink-0" onClick={() => onMove("home")}>
          Home
        </button>
      )}
    </div>
  );
};

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
  // Moving troops to or from an outpost's garrison.
  const [moving, setMoving] = useState<{ idx: number; mode: "station" | "home" } | null>(null);
  // Spots offered for the next outpost (null: not asked yet).
  const [spots, setSpots] = useState<OutpostSpot[] | null>(null);
  const slots = outpostSlots(state);
  const blocked = outpostBlocked(state);
  const cost = outpostCost(state);
  // What the next outpost still lacks, shown under its card like a building's price.
  const hallNeeded = OUTPOST.hallLevels[state.outposts.length];
  const hallShort = state.outposts.length >= slots;
  const lacking = RESOURCES.filter((r) => state.resources[r.id] < cost.resources[r.id]);
  const peopleShort = state.population < cost.people;
  const tooBig = cost.resources.iron > getRates(state).capacity;
  const wait = outpostWaitMs(state);
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
          content={`Found outposts on free land near your village: each has its own iron, wood, clay and crop fields (up to level ${OUTPOST.fieldMaxLevel}) and its own builder, and sends everything home. The land round an outpost favours one resource: woods give wood, hills clay, rocky ground iron, open fields and water crop, +${OUTPOST.landBonusPerTile}% for each tile of it, up to +${OUTPOST.landBonusMax}%. You choose where to settle. Town Hall ${OUTPOST.hallLevels.join(", ")} each allow one more. Station troops there to attack from closer (they come back there); while troops are stationed there the outpost can be attacked, and only its garrison defends it. An empty outpost can't be attacked.`}
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
            <GarrisonRow idx={i} onMove={(mode) => setMoving({ idx: i, mode })} />
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
              <span className={clsx("text-xs", blocked ? "text-bad" : "text-good")}>
                {hallShort
                  ? `Needs Town Hall ${hallNeeded}`
                  : lacking.length || peopleShort
                    ? `Still needed: ${[
                        ...lacking.map((r) => `${compact(cost.resources[r.id] - state.resources[r.id])} ${r.name.toLowerCase()}`),
                        ...(peopleShort ? [`${compact(cost.people - state.population)} people`] : []),
                      ].join(", ")}`
                    : "Ready to found"}
              </span>
            </div>
            {spots == null && (
              <button className="btn btn-sm btn-gold shrink-0" disabled={!!blocked || busy != null} onClick={chooseSpot}>
                {busy === "spots" ? "Looking…" : "Found outpost"}
              </button>
            )}
          </div>
          <div className="inset grid grid-cols-5 divide-x divide-line/50 py-2">
            {RESOURCES.map((r) => (
              <span key={r.id} className="flex flex-col items-center gap-0.5">
                <Image alt={r.name} className="w-6 h-6 object-contain" src={r.img} />
                <span className={clsx("text-xs font-extrabold tabular-nums", lacking.includes(r) ? "text-bad" : "text-parch")}>
                  {compact(cost.resources[r.id])}
                </span>
              </span>
            ))}
            <span className="flex flex-col items-center gap-0.5">
              <Image alt="People" className="w-6 h-6 object-contain" src={population} />
              <span className={clsx("text-xs font-extrabold tabular-nums", peopleShort ? "text-bad" : "text-parch")}>{compact(cost.people)}</span>
            </span>
          </div>
          <span className="text-[11px] text-muted">
            {hallShort ? (
              <>
                <GameIcon e="🏛️" /> Town Hall {hallNeeded} opens this outpost. Settlers are people at home; soldiers don&apos;t count.
              </>
            ) : tooBig ? (
              <>
                <GameIcon e="📦" /> Your warehouse holds {compact(getRates(state).capacity)}: raise it to store {compact(cost.resources.iron)} of each.
              </>
            ) : lacking.length && Number.isFinite(wait) ? (
              <>
                <GameIcon e="⏳" /> Enough resources in about {formatDuration(wait)} at your current production.
              </>
            ) : peopleShort ? (
              <>
                <GameIcon e="👥" /> Settlers are people at home ({compact(state.population)} now); soldiers don&apos;t count.
              </>
            ) : null}
          </span>
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
      <GarrisonDrawer open={moving} onClose={() => setMoving(null)} />
    </section>
  );
};

/**
 * A one-line summary of the outposts near the top of the Build screen (they
 * live under their own tab, past every building): what they send home, idle
 * builders and the troops stationed there. Tapping it opens the tab.
 */
export const OutpostsShortcut = ({ onOpen }: { onOpen: () => void }) => {
  const { state } = useGame();
  const perHour = state.outposts.reduce((n, o) => {
    const out = outpostOutput(o);

    return n + RESOURCES.reduce((m, r) => m + out[r.id], 0);
  }, 0);
  const idle = state.outposts.filter((o) => !o.job).length;
  const stationed = state.outposts.reduce((n, o) => n + armySize(garrisonOf(o)), 0);

  return (
    <button className="card-flat rounded-xl px-2.5 py-2 flex items-center gap-2.5 text-left active:scale-[0.99]" type="button" onClick={onOpen}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" className="w-9 h-9 object-contain" src={OUTPOST_IMG} />
      <span className="flex-1 min-w-0 leading-tight">
        <span className="block text-sm font-bold">
          {state.outposts.length} outpost{state.outposts.length === 1 ? "" : "s"}
          {perHour > 0 && <span className="text-good tabular-nums"> · +{compact(perHour)}/h home</span>}
        </span>
        <span className={clsx("block text-[11px] truncate", idle ? "text-goldtext" : "text-muted")}>
          {idle ? `${idle} builder${idle === 1 ? "" : "s"} free` : "Builders at work"}
          {stationed > 0 && <span className="text-muted"> · 🛡️ {compact(stationed)} stationed</span>}
        </span>
      </span>
      <span className="text-muted text-sm">›</span>
    </button>
  );
};
