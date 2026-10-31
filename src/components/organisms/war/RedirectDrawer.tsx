"use client";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import { ArmyLine, BanditWarning, UnitBadge, fmt } from "./shared";
import type { AttackTarget } from "./SendArmyDrawer";

import { Button } from "@/components/atoms/Button";
import { Drawer } from "@/components/molecules/Drawer";
import { useGame, useTelegramContext } from "@/context";
import { RESOURCE_IDS, RESOURCE_NAMES, REDIRECT, UNITS } from "@/lib/game/config";
import { Army, GameError, emptyArmy } from "@/lib/game/engine";
import { Point, TERRAIN, marchRoute, pointAlong, routeMs, routeTimeline, seaRoute, terrainAt } from "@/lib/game/map";
import {
  Loot,
  battleNumbers,
  carryOf,
  fighterCount,
  landingFactorFor,
  maxOrders,
  ordersCardCost,
  payFromLoot,
  redirectSupply,
  splitForRedirect,
  splitSpoils,
} from "@/lib/game/war";
import { formatDuration } from "@/lib/format";
import { GameIcon, IconText } from "@/components/atoms/GameIcon";

/** One of your armies out on the map: marching on a target, or walking home. */
export type ArmyOnRoad = {
  /** "attack": on its way to a target (attack id); "march": on its way home (march id). */
  kind: "attack" | "march";
  id: number | string;
  units: Army;
  from: Point;
  to: Point;
  /** The target's name, or "Your tribe" on the way home. */
  toName: string;
  /** Where it set off from on this road, and when it gets there. */
  startedAt: number;
  endsAt: number;
  loot: Partial<Loot> | null;
  coins: number;
  /** New orders this expedition already took. */
  hops: number;
};

/** Where the army is right now, on a whole tile, and whether it's out at sea. */
export function armySpot(a: ArmyOnRoad, now: number) {
  const road = marchRoute(a.from, a.to);
  const f = Math.min(1, Math.max(0, (now - a.startedAt) / Math.max(1, a.endsAt - a.startedAt)));
  const p = pointAlong(road, routeTimeline(road, a.units), f);
  const tile = { x: Math.round(p.x), y: Math.round(p.y) };

  return { tile, atSea: p.atSea || terrainAt(tile.x, tile.y) === "sea" };
}

const lootSum = (l: Partial<Loot> | null | undefined) => RESOURCE_IDS.reduce((a, r) => a + (l?.[r] ?? 0), 0);

const LootLine = ({ loot, coins }: { loot: Partial<Loot> | null | undefined; coins?: number }) => {
  const parts = RESOURCE_IDS.filter((r) => (loot?.[r] ?? 0) > 0);

  if (!parts.length && !coins) return <span className="text-muted">nothing</span>;

  return (
    <span className="inline-flex flex-wrap gap-x-2">
      {parts.map((r) => (
        <span key={r}>
          {fmt(loot![r]!)} {RESOURCE_NAMES[r].toLowerCase()}
        </span>
      ))}
      {!!coins && (
        <span>
          <GameIcon e="🪙" /> {fmt(coins)}
        </span>
      )}
    </span>
  );
};

/** The War Orders card: how many new orders an expedition can take, and the next level. */
const OrdersCard = () => {
  const { state, buyOrdersCard } = useGame();
  const [busy, setBusy] = useState(false);

  if (!state) return null;
  const level = state.cards?.orders ?? 0;
  const cost = ordersCardCost(state);

  return (
    <div className="rounded-xl border border-gold/50 bg-gradient-to-b from-[#3A2A1B] to-[#1E1610] px-3 py-2.5 flex items-center gap-3">
      <span className="text-2xl shrink-0">
        <GameIcon e="📜" />
      </span>
      <span className="flex-1 min-w-0 leading-tight">
        <span className="block text-sm font-extrabold text-goldtext">
          War Orders card {level > 0 ? `· level ${level}` : ""}
        </span>
        <span className="block text-[11px] text-sub">
          {maxOrders(state)} new {maxOrders(state) === 1 ? "order" : "orders"} per expedition
          {cost != null ? ` · next level: ${maxOrders(state) + 1}` : " · highest level"}
        </span>
      </span>
      {cost != null && (
        <Button
          disabled={busy || state.coins < cost}
          size="small"
          onClick={async () => {
            setBusy(true);
            await buyOrdersCard();
            setBusy(false);
          }}
        >
          <GameIcon e="🪙" /> {fmt(cost)}
        </Button>
      )}
    </div>
  );
};

/** Tapping one of your armies on the map: what it has, and the orders you can give it. */
export const ArmyOrdersDrawer = ({
  army,
  onClose,
  onNewTarget,
  onRecall,
}: {
  army: ArmyOnRoad | null;
  onClose: () => void;
  onNewTarget: (a: ArmyOnRoad) => void;
  onRecall: (id: number) => void;
}) => {
  const { state, now } = useGame();

  if (!state) return null;
  const left = army ? maxOrders(state) - army.hops : 0;
  const spot = army ? armySpot(army, now) : null;
  const gone = !!army && army.endsAt <= now;

  return (
    <Drawer
      isOpen={!!army}
      position="bottom"
      title={army ? (army.kind === "attack" ? `Marching on ${army.toName}` : "On the way home") : ""}
      onClose={onClose}
    >
      {army && (
        <div className="flex flex-col gap-3 pt-2">
          <div className="inset p-2.5 flex flex-col gap-1.5 text-sm">
            <div>
              <span className="text-muted">Army: </span>
              <ArmyLine army={army.units} />
            </div>
            <div>
              <span className="text-muted">Spoils: </span>
              <LootLine coins={army.coins} loot={army.loot} />
            </div>
            <div className="text-xs text-sub">
              <GameIcon e="⏱" /> {army.kind === "attack" ? "Arrives" : "Home"} in {formatDuration(Math.max(0, army.endsAt - now))}
            </div>
          </div>

          <p className="text-xs text-sub">
            <GameIcon e="🧭" /> Give it a new target from where it stands. You can leave troops behind (they walk home with
            their share of the spoils), but you can't add any. Supplies for the new road come out of the spoils first, then
            your storage.
          </p>

          <div className="flex items-center justify-between text-xs font-bold">
            <span className={left > 0 ? "text-goldtext" : "text-bad"}>
              {left > 0 ? `${left} new ${left === 1 ? "order" : "orders"} left on this expedition` : "No new orders left on this expedition"}
            </span>
            <span className="text-muted">
              {army.hops}/{maxOrders(state)} used
            </span>
          </div>

          {spot?.atSea && !gone && (
            <p className="text-xs font-bold text-[#A9D3EA]">
              <GameIcon e="⛵" /> The army is out at sea. New orders once it's back on land.
            </p>
          )}

          <div className="flex gap-2">
            {army.kind === "attack" && (
              <Button className="flex-1" disabled={gone} variant="outline" onClick={() => onRecall(Number(army.id))}>
                <GameIcon e="↩️" /> Recall
              </Button>
            )}
            <Button className="flex-1" disabled={gone || left <= 0 || !!spot?.atSea} onClick={() => onNewTarget(army)}>
              <GameIcon e="🧭" /> New target
            </Button>
          </div>

          {(left <= 0 || (state.cards?.orders ?? 0) === 0) && <OrdersCard />}
        </div>
      )}
    </Drawer>
  );
};

/**
 * New orders: the troops that go on (never more than the army has), the new
 * road from where it stands, what the supplies cost and who pays for them.
 */
export const RedirectDrawer = ({
  army,
  target,
  home,
  onClose,
  onSent,
}: {
  army: ArmyOnRoad | null;
  target: AttackTarget | null;
  home: Point;
  onClose: () => void;
  onSent: () => void;
}) => {
  const { state, rates, now, redirect } = useGame();
  const { telegram } = useTelegramContext();
  const [keep, setKeep] = useState<Army>(emptyArmy());
  const [busy, setBusy] = useState(false);
  const open = !!army && !!target;

  // Open with the whole army going on.
  useEffect(() => {
    if (army) {
      const k = emptyArmy();

      for (const u of UNITS) if (!u.transport) k[u.id] = army.units[u.id] ?? 0;
      setKeep(k);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [army?.id, target?.title]);

  // Where the army stands now (fixed while the drawer is open, like the server will see it).
  const where = useMemo(() => (army ? armySpot(army, now).tile : null), [army?.id, target?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state || !rates) return null;

  let plan: {
    go: Army;
    back: Army;
    leg: number;
    homeAfter: number;
    backMs: number;
    supply: Loot;
    fromSpoils: Loot;
    owed: Loot;
    goLoot: Loot;
    backLoot: Loot;
    naval: boolean;
  } | null = null;
  let problem: string | null = null;

  if (army && target && where) {
    try {
      const naval = seaRoute(where, target.at).naval;
      const { go, back } = splitForRedirect(army.units, keep, {
        go: naval || seaRoute(target.at, home).naval,
        back: seaRoute(where, home).naval,
      });
      const leg = routeMs(go, where, target.at, rates.marchMultiplier);
      const share = splitSpoils(army.loot ?? {}, army.coins, go, back);
      const supply = redirectSupply(go, leg);
      const paid = payFromLoot(share.go, supply);
      const fromSpoils = Object.fromEntries(RESOURCE_IDS.map((r) => [r, supply[r] - paid.owed[r]])) as Loot;

      plan = {
        go,
        back,
        leg,
        homeAfter: routeMs(go, target.at, home, rates.marchMultiplier),
        backMs: routeMs(back, where, home, rates.marchMultiplier),
        supply,
        fromSpoils,
        owed: paid.owed,
        goLoot: paid.loot,
        backLoot: share.back,
        naval,
      };
      const short = RESOURCE_IDS.find((r) => paid.owed[r] > state.resources[r]);

      if (short) problem = `Not enough ${RESOURCE_NAMES[short].toLowerCase()} at home for the supplies`;
    } catch (e) {
      problem = e instanceof GameError ? e.message : "These orders can't be given";
    }
  }

  const terrain = target?.terrain ?? "plains";
  const landing = plan?.naval && target?.to.target ? landingFactorFor(target.harbor ?? 0) : 1;
  const ground = (1 + TERRAIN[terrain].defense) * landing;
  const d = target?.defense;
  const defMin = d ? d.min * ground : 0;
  const defMax = d ? d.max * ground : 0;
  const power = plan ? battleNumbers(state, plan.go, null, terrain, 0).attack : 0;
  const verdict = !d ? "" : power > defMax * 1.1 ? "Likely victory" : power < defMin * 0.9 ? "Likely defeat" : "Close fight";
  const carried = plan ? lootSum(plan.goLoot) : 0;
  const room = plan ? carryOf(plan.go) - carried : 0;
  const owedTotal = plan ? lootSum(plan.owed) : 0;

  const send = async () => {
    if (!army || !target) return;
    setBusy(true);
    const r = await redirect(army.kind === "attack" ? { attack: Number(army.id) } : { march: String(army.id) }, target.to, keep);

    setBusy(false);
    if (r) {
      telegram?.WebApp.HapticFeedback.notificationOccurred("success");
      onSent();
    }
  };

  const fighters = army ? UNITS.filter((u) => !u.transport && (army.units[u.id] ?? 0) > 0) : [];

  return (
    <Drawer isOpen={open} position="bottom" title={target ? `New orders: ${target.title.replace(/^Raid /, "")}` : ""} onClose={onClose}>
      {army && target && (
        <div className="flex flex-col gap-3 pt-2">
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="pill h-7 px-2">
              <GameIcon e="🧭" /> Order {army.hops + 1} of {maxOrders(state)}
            </span>
            <span className="pill h-7 px-2">
              <GameIcon e={terrain === "mountains" || terrain === "hills" ? "⛰️" : terrain === "forest" ? "🌲" : "🌾"} />{" "}
              {TERRAIN[terrain].name}
              {TERRAIN[terrain].defense > 0 && <span className="text-bad"> · +{TERRAIN[terrain].defense * 100}% their defense</span>}
            </span>
            {plan?.naval && (
              <span className="pill pill-sea h-7 px-2">
                <GameIcon e="🌊" /> Across the sea
              </span>
            )}
          </div>

          {/* Troops that go on: at most what the army has. */}
          <div className="flex flex-col gap-2">
            {fighters.map((u) => {
              const max = army.units[u.id] ?? 0;
              const n = keep[u.id];
              const set = (v: number) => setKeep((k) => ({ ...k, [u.id]: Math.max(0, Math.min(max, Math.floor(v || 0))) }));

              return (
                <div
                  key={u.id}
                  className={clsx(
                    "rounded-xl border px-2.5 py-2 flex items-center gap-2",
                    n > 0 ? "bg-buildingBg border-line" : "bg-panel/60 border-line/60 opacity-70"
                  )}
                >
                  <UnitBadge size={30} unit={u.id} />
                  <div className="flex-1 min-w-0 leading-tight">
                    <div className="text-sm font-bold truncate">{u.name}</div>
                    <div className="text-[10px] text-muted">{fmt(max - n)} head home</div>
                  </div>
                  <input
                    aria-label={`${u.name} going on`}
                    className="w-24 h-1.5 accent-[#E3A948]"
                    max={max}
                    min={0}
                    type="range"
                    value={n}
                    onChange={(e) => set(Number(e.target.value))}
                  />
                  <span className="w-14 text-right text-xs font-extrabold tabular-nums">
                    {fmt(n)}/{fmt(max)}
                  </span>
                </div>
              );
            })}
          </div>

          {plan && where && (
            <BanditWarning from={where} lairs={target.bandits} s={state} to={target.at} units={plan.go} />
          )}

          {plan && (
            <div className="inset p-2.5 flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between text-sm">
                <span className="font-extrabold">
                  <GameIcon e="⚔️" /> {fmt(power)}
                </span>
                <span
                  className={clsx(
                    "font-extrabold",
                    verdict === "Likely victory" ? "text-good" : verdict === "Likely defeat" ? "text-bad" : "text-gold"
                  )}
                >
                  {verdict}
                </span>
                <span className="font-extrabold">
                  {d?.exact ? fmt(defMin) : `${fmt(defMin)}–${fmt(defMax)}`} <GameIcon e="🛡️" />
                </span>
              </div>
              <div className="grid grid-cols-3 text-center font-bold text-sub">
                <span>
                  <GameIcon e="👥" /> {fmt(fighterCount(plan.go))}
                </span>
                <span>
                  <GameIcon e="🎒" /> {fmt(Math.max(0, room))} room
                </span>
                <span>
                  <GameIcon e="⏱" /> {formatDuration(plan.leg)}
                </span>
              </div>
              <div className="border-t border-line/60 pt-1.5">
                <span className="text-muted">Supplies: </span>
                <LootLine loot={plan.supply} />
              </div>
              <div className="text-sub">
                {owedTotal === 0 ? (
                  <>Paid from the spoils they carry.</>
                ) : lootSum(plan.fromSpoils) > 0 ? (
                  <>
                    From the spoils, plus <LootLine loot={plan.owed} /> from your storage.
                  </>
                ) : (
                  <>
                    From your storage: <LootLine loot={plan.owed} />.
                  </>
                )}
              </div>
              {carried > 0 && (
                <div className="text-sub">
                  Still carrying <LootLine loot={plan.goLoot} />. Lose the battle and these spoils are lost.
                </div>
              )}
              {fighterCount(plan.back) > 0 && (
                <div className="text-sub">
                  <ArmyLine army={plan.back} /> head home in {formatDuration(plan.backMs)}
                  {lootSum(plan.backLoot) > 0 && (
                    <>
                      {" "}
                      with <LootLine loot={plan.backLoot} />
                    </>
                  )}
                  .
                </div>
              )}
              <div className="text-muted">Back home {formatDuration(plan.leg + plan.homeAfter)} after the battle starts.</div>
            </div>
          )}

          {problem && <p className="text-xs font-bold text-bad">{problem}</p>}

          <Button isFull disabled={busy || !plan || !!problem} size="large" onClick={send}>
            {busy ? (
              "Sending orders…"
            ) : plan ? (
              <IconText
                text={`🧭 ${plan.naval ? "Sail" : "March"} on · arrives ${new Date(now + plan.leg).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`}
              />
            ) : (
              "Choose troops"
            )}
          </Button>
          <p className="text-[11px] text-center text-muted -mt-1">
            Supplies: {Math.round(REDIRECT.supplyShare * 100)}% of the troops&apos; training cost, plus crop for the road.
          </p>
        </div>
      )}
    </Drawer>
  );
};
