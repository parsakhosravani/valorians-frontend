"use client";

import React, { useCallback, useEffect, useState } from "react";
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
import { Amount, Backdrop, Button, Card, Meter, Overline } from "@/components/ui";
import { GameIcon, ResourceNode } from "@/art";

type Float = { id: number; x: number; y: number; text: string; crit: boolean };

/** Spots on the 280px resource node where the weak point can appear. */
const SPOTS: [number, number][] = [
  [66, 112],
  [164, 96],
  [184, 166],
  [78, 176],
  [122, 138],
  [136, 200],
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
    <Card className="flex flex-col gap-1.5">
      <div className="flex justify-between items-baseline gap-2">
        <span className="font-display font-bold text-title leading-tight">{title}</span>
        <span className="text-caption text-parch-500 font-extrabold whitespace-nowrap">LV {level}</span>
      </div>
      <span className="text-small text-parch-300 leading-snug">{desc}</span>
      <Button
        className="mt-auto"
        disabled={maxed || coins < cost}
        loading={busy}
        size="sm"
        onClick={async () => {
          setBusy(true);
          await onUpgrade();
          setBusy(false);
        }}
      >
        {maxed ? "Max" : <Amount icon="coin" value={cost} />}
      </Button>
    </Card>
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
      <Backdrop dim={0.6} scene={activeResource.id} />
      <div
        className={clsx(
          "fixed inset-0 -z-10 max-w-md mx-auto",
          frenzy
            ? "bg-[radial-gradient(circle_at_50%_45%,rgba(219,90,46,0.42),rgba(21,17,13,0)_62%)]"
            : "bg-[radial-gradient(circle_at_50%_45%,rgba(240,190,90,0.16),rgba(21,17,13,0)_55%)]"
        )}
      />

      {/* Rune-stones: pick what to mine */}
      <div className="grid grid-cols-4 gap-2 px-3 pt-1">
        {RESOURCES.map((r) => {
          const active = r.id === activeResource.id;

          return (
            <button
              key={r.id}
              aria-pressed={active}
              className={clsx(
                "flex flex-col items-center gap-0.5 py-2 rounded-2xl border transition-colors",
                active ? "bg-gradient-to-b from-[#3A2B16] to-ink-800 border-gold-500 shadow-glow" : "bg-ink-800/90 border-ink-500/70"
              )}
              onClick={() => setActiveResource(r)}
            >
              <GameIcon id={r.id} size={28} />
              <span className={clsx("text-caption font-extrabold tracking-[0.12em]", active ? "text-gold-300" : "text-parch-500")}>{r.name.toUpperCase()}</span>
              <span className={clsx("font-extrabold text-small", state.resources[r.id] >= rates.capacity && "text-blood-400")}>
                {compact(state.resources[r.id])}
              </span>
            </button>
          );
        })}
      </div>

      {/* Combo & Frenzy */}
      <div className="flex items-center gap-3 px-5 pt-4">
        <div className="flex flex-col min-w-[78px]">
          <span className="font-display font-extrabold text-display-xl leading-none text-gold-300">
            ×{(combo.multiplier * (frenzy ? 2 : 1)).toFixed(1)}
          </span>
          <Overline>Combo {combo.count}</Overline>
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex justify-between">
            <Overline className={frenzy ? "!text-ember-300" : ""}>{frenzy ? "Frenzy! ×2, no stamina" : "Frenzy"}</Overline>
            <Overline>{meterPct}%</Overline>
          </div>
          <Meter label="Frenzy" max={100} tone="ember" value={meterPct} />
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
            <ResourceNode
              className={clsx(
                "w-full h-full pointer-events-none",
                frenzy ? "drop-shadow-[0_0_40px_rgba(219,90,46,0.7)]" : "drop-shadow-[0_18px_30px_rgba(0,0,0,0.5)]"
              )}
              id={activeResource.id}
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
                    ? "border-ember-300 bg-ember-300/30 shadow-[0_0_22px_#DB5A2E]"
                    : "border-gold-400 bg-gold-300/25 shadow-[0_0_22px_#F0BE5A]"
                )}
                style={{ left: SPOTS[s][0], top: SPOTS[s][1] }}
                onPointerDown={(e) => strike(e, i)}
              >
                <span className="w-3.5 h-3.5 rounded-full bg-parch-50" />
              </button>
            ))}
          {floats.map((f) => (
            <span
              key={f.id}
              className={clsx(
                "pointer-events-none absolute -translate-x-1/2 font-display font-black animate-mine-animation whitespace-nowrap",
                f.crit ? "text-[34px] text-gold-300 [text-shadow:0_0_14px_#DB5A2E]" : "text-[26px] text-parch [text-shadow:0_2px_4px_#000]"
              )}
              style={{ left: f.x, top: f.y }}
            >
              {f.text}
            </span>
          ))}
        </div>
        <p className="text-center text-small text-parch-300 px-6 mt-2 min-h-[20px]">
          {isFull ? (
            <span className="text-blood-400 font-bold">{activeResource.name} storage is full — upgrade your Resource Warehouse</span>
          ) : outOfStamina ? (
            <span>Your miners rest. Stamina returns in {formatDuration(msToUtcMidnight(now))}.</span>
          ) : (
            <>
              Hit the <b className="text-gold-300">glowing rune</b> for ×3. Keep a rhythm to grow your combo.
            </>
          )}
        </p>
      </div>

      {/* Stamina */}
      <div className="px-4 flex items-center gap-3">
        <GameIcon className="shrink-0" id="energy" size={26} />
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex justify-between text-small font-extrabold">
            <span>
              Daily stamina {Math.floor(state.energy).toLocaleString("en-US")} / {rates.energyCapacity.toLocaleString("en-US")}
            </span>
            <span className="text-parch-500 text-caption font-bold self-end">refills in {formatDuration(msToUtcMidnight(now))}</span>
          </div>
          <Meter label="Stamina" max={rates.energyCapacity} size="xs" value={state.energy} />
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
