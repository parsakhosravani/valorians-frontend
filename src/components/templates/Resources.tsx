"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import { RESOURCES, ReadyLive, useGameActions, useLive, useTelegramContext } from "@/context";
import { Countdown } from "@/components/atoms/Countdown";
import useBackButtonReset from "@/hooks/useBackButtonReset";
import { compact, grouped } from "@/lib/format";
import {
  FRENZY_METER_MAX,
  MAX_SKILL_LEVEL,
  STAMINA_PER_TAP,
  energyCapacityForLevel,
  skillUpgradeCost,
  tapPowerForLevel,
} from "@/lib/game/config";
import { frenzyActive } from "@/lib/game/engine";
import type { ResourceId } from "@/lib/game/config";
import { Button } from "@/components/atoms/Button";

type Float = { id: number; x: number; y: number; text: string; crit: boolean };

/**
 * Where the weak spot can appear on each 280px rock (top-left of the 48px rune),
 * picked so the rune always sits on the art. Every list has the same length.
 */
const SPOTS_BY_RESOURCE: Record<ResourceId, [number, number][]> = {
  iron: [[122, 110], [24, 148], [215, 154], [121, 32], [187, 91], [59, 94]],
  wood: [[126, 121], [16, 165], [178, 30], [215, 141], [137, 201], [55, 101]],
  clay: [[118, 113], [27, 175], [155, 216], [168, 16], [24, 59], [206, 139]],
  crop: [[115, 99], [103, 215], [125, 17], [49, 62], [185, 72], [126, 159]],
};
const SPOT_COUNT = SPOTS_BY_RESOURCE.iron.length;

let floatId = 0;
const pick = (except: number[]) => {
  const options = Array.from({ length: SPOT_COUNT }, (_, i) => i).filter((i) => !except.includes(i));

  return options[Math.floor(Math.random() * options.length)];
};

/** When stamina refills: the next UTC midnight. */
const nextUtcMidnight = (now: number) => {
  const d = new Date(now);

  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
};

/**
 * Everything the Mine shows, at the precision it shows it. The screen redraws
 * when this changes (a tap, a shown number ticking over), not every second:
 * the clock only counts while a frenzy's 8-second bar is running, and the
 * refill countdown ticks on its own.
 */
const mineKey = (l: ReadyLive) =>
  JSON.stringify([
    RESOURCES.map((r) => [compact(l.state.resources[r.id]), l.state.resources[r.id] >= l.rates.capacity]),
    Math.floor(l.state.energy),
    Math.floor(l.state.coins),
    l.state.frenzy,
    l.state.skills,
    l.rates.capacity,
    l.rates.energyCapacity,
    l.activeResource.id,
    l.combo,
    frenzyActive(l.state, l.now) ? l.now : 0,
    nextUtcMidnight(l.now),
  ]);

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
    <div className="inset p-2.5 flex flex-col gap-1.5">
      <div className="flex justify-between items-center gap-1">
        <span className="font-display font-bold text-[13px] leading-tight">{title}</span>
        <span className="pill h-5 px-1.5 text-micro">Lv {level}</span>
      </div>
      <span className="text-xs text-sub leading-snug">{desc}</span>
      {/* mt-auto keeps the button on the card's bottom edge, so both cards line up when one title wraps */}
      <Button
        className="mt-auto"
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
  const { state, rates, now, activeResource, combo } = useLive((l) => l, (a, b) => mineKey(a) === mineKey(b));
  const { setActiveResource, tap, upgradeSkill } = useGameActions();
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
        className="fixed inset-0 w-full h-full object-cover opacity-35 -z-10"
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
                "flex flex-col items-center gap-0.5 py-2 transition-transform active:scale-95",
                active ? "card-hero" : "card-flat opacity-80"
              )}
              onClick={() => setActiveResource(r)}
            >
              <Image alt="" className="w-7 h-7 object-contain" src={r.img} />
              <span className={clsx("font-display font-bold text-[11px] tracking-wider", active ? "text-goldtext" : "text-sub")}>{r.name.toUpperCase()}</span>
              <span className={clsx("font-extrabold text-sm", state.resources[r.id] >= rates.capacity && "text-bad")}>
                {compact(state.resources[r.id])}
              </span>
            </button>
          );
        })}
      </div>

      {/* Combo & Frenzy */}
      <div className="card-flat mx-3 mt-3 px-3 py-2.5 flex items-center gap-3 bg-ink/60">
        <div className="flex flex-col min-w-[78px]">
          <span className="title-screen !text-[28px] leading-none">
            ×{(combo.multiplier * (frenzy ? 2 : 1)).toFixed(1)}
          </span>
          <span className="text-[11px] font-extrabold tracking-[0.12em] text-muted">COMBO {combo.count}</span>
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex justify-between text-[11px] font-extrabold tracking-[0.1em] text-muted">
            <span className={frenzy ? "text-[#FFB27A]" : ""}>{frenzy ? "FRENZY! ×2, NO STAMINA" : "FRENZY"}</span>
            <span>{meterPct}%</span>
          </div>
          <div className="bar h-2.5">
            <span className="bar-fill duration-200" style={{ width: `${meterPct}%` }} />
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
              src={activeResource.rock}
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
                style={{ left: SPOTS_BY_RESOURCE[activeResource.id][s][0], top: SPOTS_BY_RESOURCE[activeResource.id][s][1] }}
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
            <span>Your miners rest. Stamina returns in <Countdown to={nextUtcMidnight(now)} />.</span>
          ) : (
            <>
              Hit the <b className="text-goldtext">glowing rune</b> for ×3. Keep a rhythm to grow your combo.
            </>
          )}
        </p>
      </div>

      {/* Stamina and mining upgrades */}
      <div className="card mx-3 mb-2 p-3 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <svg aria-hidden="true" className="text-goldtext shrink-0" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="22">
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </svg>
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex justify-between text-sm font-extrabold">
            <span>
              Daily stamina {grouped(Math.floor(state.energy))} / {grouped(rates.energyCapacity)}
            </span>
            <span className="text-muted text-xs font-bold self-end">refills in <Countdown to={nextUtcMidnight(now)} /></span>
          </div>
          <div className="bar h-2">
            <span className="bar-fill" style={{ width: `${(state.energy / rates.energyCapacity) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Upgrades */}
      <div className="grid grid-cols-2 gap-2">
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
    </div>
  );
};
