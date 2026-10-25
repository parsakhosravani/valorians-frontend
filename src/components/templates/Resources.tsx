"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import { RESOURCES, useGame, useTelegramContext } from "@/context";
import useBackButtonReset from "@/hooks/useBackButtonReset";
import { compact, formatDuration } from "@/lib/format";
import {
  FRENZY_METER_MAX,
  MAX_SKILL_LEVEL,
  STAMINA_PER_TAP,
  energyCapacityForLevel,
  skillUpgradeCost,
  tapPowerForLevel,
} from "@/lib/game/config";
import { frenzyActive } from "@/lib/game/engine";
import { Button } from "@/components";

type Float = { id: number; x: number; y: number; text: string; crit: boolean };

/** Spots on the 280px rock where the weak point can appear. */
const SPOTS: [number, number][] = [
  [60, 46],
  [178, 64],
  [196, 160],
  [70, 168],
  [128, 108],
  [140, 196],
];

let floatId = 0;
const pick = (except: number[]) => {
  const options = SPOTS.map((_, i) => i).filter((i) => !except.includes(i));

  return options[Math.floor(Math.random() * options.length)];
};

const msToUtcMidnight = (now: number) => {
  const d = new Date(now);

  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
};

const Upgrade = ({
  title,
  desc,
  level,
  onUpgrade,
  coins,
}: {
  title: string;
  desc: string;
  level: number;
  coins: number;
  onUpgrade: () => Promise<boolean>;
}) => {
  const [busy, setBusy] = useState(false);
  const maxed = level >= MAX_SKILL_LEVEL;
  const cost = skillUpgradeCost(level);

  return (
    <div className="bg-panel border border-line rounded-2xl p-3 flex flex-col gap-1.5">
      <div className="flex justify-between items-baseline">
        <span className="font-display font-bold text-sm">{title}</span>
        <span className="text-xs text-muted font-bold">Lv {level}</span>
      </div>
      <span className="text-xs text-sub leading-snug">{desc}</span>
      <Button
        disabled={busy || maxed || coins < cost}
        size="small"
        onClick={async () => {
          setBusy(true);
          await onUpgrade();
          setBusy(false);
        }}
      >
        {maxed ? "Max" : `${compact(cost)} coins`}
      </Button>
    </div>
  );
};

export const Resources = () => {
  useBackButtonReset();
  const { telegram } = useTelegramContext();
  const { state, rates, now, activeResource, setActiveResource, tap, combo, upgradeSkill } = useGame();
  const [spots, setSpots] = useState<number[]>([0]);
  const [floats, setFloats] = useState<Float[]>([]);

  const frenzy = frenzyActive(state, now);
  const count = state.resources[activeResource.id];
  const isFull = count >= rates.capacity;
  const outOfStamina = !frenzy && state.energy < STAMINA_PER_TAP;
  const blocked = isFull || outOfStamina;

  // Weak spots wander; Frenzy shows three at once.
  useEffect(() => {
    const want = frenzy ? 3 : 1;

    setSpots((cur) => {
      const next = cur.slice(0, want);

      while (next.length < want) next.push(pick(next));

      return next;
    });
    const t = setInterval(() => setSpots((cur) => cur.map((s, i) => (i === 0 ? pick(cur) : s))), frenzy ? 1100 : 1600);

    return () => clearInterval(t);
  }, [frenzy]);

  const addFloat = (e: React.PointerEvent, gained: number, crit: boolean) => {
    const rect = (e.currentTarget.closest("[data-rock]") as HTMLElement).getBoundingClientRect();
    const f = {
      id: ++floatId,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 30,
      text: `${crit ? "CRIT " : ""}+${compact(gained)}`,
      crit,
    };

    setFloats((p) => [...p.slice(-12), f]);
    setTimeout(() => setFloats((p) => p.filter((x) => x.id !== f.id)), 700);
  };

  const strike = useCallback(
    (e: React.PointerEvent, spotIndex?: number) => {
      e.stopPropagation();
      const crit = spotIndex !== undefined;
      const gained = tap(activeResource.id, crit);

      if (!gained) {
        telegram?.WebApp.HapticFeedback.notificationOccurred("error");

        return;
      }
      telegram?.WebApp.HapticFeedback.impactOccurred(crit ? "heavy" : "light");
      addFloat(e, gained, crit);
      if (crit) setSpots((cur) => cur.map((s, i) => (i === spotIndex ? pick(cur) : s)));
    },
    [tap, activeResource.id, telegram]
  );

  const meterPct = frenzy
    ? Math.max(0, Math.round(((state.frenzy.until - now) / 8000) * 100))
    : Math.round((state.frenzy.meter / FRENZY_METER_MAX) * 100);

  return (
    <div className={clsx("relative min-h-full flex flex-col", frenzy && "animate-frenzy")}>
      <Image
        alt=""
        className="fixed inset-0 w-full h-full object-cover opacity-20 -z-10"
        src={activeResource.bg}
      />
      <div
        className={clsx(
          "fixed inset-0 -z-10",
          frenzy
            ? "bg-[radial-gradient(circle_at_50%_45%,rgba(232,97,44,0.4),rgba(18,13,9,0)_62%)]"
            : "bg-[radial-gradient(circle_at_50%_45%,rgba(227,169,72,0.16),rgba(18,13,9,0)_55%)]"
        )}
      />

      {/* Rune-stones: pick what to mine */}
      <div className="grid grid-cols-4 gap-2 px-3 pt-1">
        {RESOURCES.map((r) => {
          const active = r.id === activeResource.id;

          return (
            <button
              key={r.id}
              className={clsx(
                "flex flex-col items-center gap-0.5 py-2 rounded-xl border-2",
                active ? "bg-panel2 border-gold shadow-[0_0_18px_rgba(227,169,72,0.25)]" : "bg-panel border-line"
              )}
              onClick={() => setActiveResource(r)}
            >
              <Image alt="" className="w-6 h-6" src={r.img} />
              <span className="font-display font-bold text-[11px] tracking-wider">{r.name.toUpperCase()}</span>
              <span className={clsx("font-extrabold text-sm", state.resources[r.id] >= rates.capacity && "text-bad")}>
                {compact(state.resources[r.id])}
              </span>
            </button>
          );
        })}
      </div>

      {/* Combo & Frenzy */}
      <div className="flex items-center gap-3 px-5 pt-4">
        <div className="flex flex-col min-w-[78px]">
          <span className="font-display font-black text-[28px] leading-none text-goldtext">
            ×{(combo.multiplier * (frenzy ? 2 : 1)).toFixed(1)}
          </span>
          <span className="text-[11px] font-extrabold tracking-[0.12em] text-muted">COMBO {combo.count}</span>
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex justify-between text-[11px] font-extrabold tracking-[0.1em] text-muted">
            <span className={frenzy ? "text-[#FFB27A]" : ""}>{frenzy ? "FRENZY! ×2, NO STAMINA" : "FRENZY"}</span>
            <span>{meterPct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-panel2 border border-line overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold to-ember transition-[width] duration-200"
              style={{ width: `${meterPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* The rock */}
      <div className="flex-1 flex flex-col items-center justify-center py-3">
        <div className="relative w-[280px] h-[280px] touch-none select-none" data-rock>
          <button
            aria-label={`Mine ${activeResource.name}`}
            className={clsx(
              "w-full h-full p-0 active:scale-[0.97] transition-transform",
              blocked && "opacity-50"
            )}
            onPointerDown={(e) => strike(e)}
          >
            <Image
              draggable={false}
              alt=""
              className={clsx(
                "w-full h-full object-contain",
                frenzy
                  ? "drop-shadow-[0_0_40px_rgba(232,97,44,0.7)]"
                  : "drop-shadow-[0_18px_30px_rgba(0,0,0,0.6)]"
              )}
              src={activeResource.img}
            />
          </button>
          {!blocked &&
            spots.map((s, i) => (
              <button
                key={`${i}-${s}`}
                aria-label="Strike the weak spot"
                className={clsx(
                  "absolute w-12 h-12 rounded-full border-[3px] flex items-center justify-center animate-spot",
                  frenzy
                    ? "border-[#FFB27A] bg-[#FFB27A]/30 shadow-[0_0_22px_#E8612C]"
                    : "border-gold bg-goldtext/25 shadow-[0_0_22px_#E3A948]"
                )}
                style={{ left: SPOTS[s][0], top: SPOTS[s][1] }}
                onPointerDown={(e) => strike(e, i)}
              >
                <span className="w-3.5 h-3.5 rounded-full bg-[#FFF4D6]" />
              </button>
            ))}
          {floats.map((f) => (
            <span
              key={f.id}
              className={clsx(
                "pointer-events-none absolute -translate-x-1/2 font-display font-black animate-mine-animation whitespace-nowrap",
                f.crit ? "text-3xl text-goldtext [text-shadow:0_0_14px_#E8612C]" : "text-2xl text-parch"
              )}
              style={{ left: f.x, top: f.y }}
            >
              {f.text}
            </span>
          ))}
        </div>
        <p className="text-center text-sm text-muted px-6 mt-2 min-h-[20px]">
          {isFull ? (
            <span className="text-bad font-bold">{activeResource.name} storage is full — upgrade your Resource Warehouse</span>
          ) : outOfStamina ? (
            <span>Your miners rest. Stamina returns in {formatDuration(msToUtcMidnight(now))}.</span>
          ) : (
            <>
              Hit the <b className="text-goldtext">glowing rune</b> for ×3. Keep a rhythm to grow your combo.
            </>
          )}
        </p>
      </div>

      {/* Stamina */}
      <div className="px-4 flex items-center gap-3">
        <svg aria-hidden="true" className="text-goldtext shrink-0" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="22">
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </svg>
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex justify-between text-sm font-extrabold">
            <span>
              Daily stamina {Math.floor(state.energy).toLocaleString("en-US")} / {rates.energyCapacity.toLocaleString("en-US")}
            </span>
            <span className="text-muted text-xs font-bold self-end">refills in {formatDuration(msToUtcMidnight(now))}</span>
          </div>
          <div className="h-1.5 rounded-full bg-panel2 overflow-hidden">
            <div className="h-full bg-gold rounded-full" style={{ width: `${(state.energy / rates.energyCapacity) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Upgrades */}
      <div className="grid grid-cols-2 gap-2 px-4 pt-3 pb-2">
        <Upgrade
          coins={state.coins}
          desc={`${tapPowerForLevel(state.skills.tap)} → ${tapPowerForLevel(state.skills.tap + 1)} per strike`}
          level={state.skills.tap}
          title="Sharper picks"
          onUpgrade={() => upgradeSkill("tap")}
        />
        <Upgrade
          coins={state.coins}
          desc={`${compact(energyCapacityForLevel(state.skills.energy))} → ${compact(energyCapacityForLevel(state.skills.energy + 1))} stamina a day`}
          level={state.skills.energy}
          title="Stronger miners"
          onUpgrade={() => upgradeSkill("energy")}
        />
      </div>
    </div>
  );
};
