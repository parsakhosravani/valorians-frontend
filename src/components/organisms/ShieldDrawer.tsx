"use client";
import { useState } from "react";
import clsx from "clsx";

import { Button, Drawer } from "@/components";
import { useGame } from "@/context";
import { formatDuration } from "@/lib/format";
import { PLUS, SHIELDS, ShieldId } from "@/lib/game/config";
import { plusActive, plusShieldReadyAt, shieldBlocked } from "@/lib/game/engine";

const label = (hours: number) => (hours >= 48 ? `${hours / 24} days` : `${hours} hours`);
const cooldownHours = Math.round(SHIELDS.cooldownMs / 3600e3);

/** Shields for Telegram Stars, plus the free weekly one that comes with Valorians Plus. */
export const ShieldDrawer = ({
  isOpen,
  onClose,
  onOpenPlus,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpenPlus: () => void;
}) => {
  const { state, now, shields } = useGame();
  const [busy, setBusy] = useState<ShieldId | "plus" | null>(null);
  const shielded = state.shieldUntil > now;
  const recharging = state.shield.cooldownUntil > now;
  const plusOn = plusActive(state);
  const weeklyAt = plusShieldReadyAt(state);
  const weeklyBlocked = weeklyAt > now ? `Back in ${formatDuration(weeklyAt - now)}` : shieldBlocked(state, PLUS.weeklyShieldHours, now);

  const run = async (key: ShieldId | "plus", fn: () => Promise<boolean>) => {
    setBusy(key);
    const ok = await fn();

    setBusy(null);
    if (ok) onClose();
  };

  return (
    <Drawer isOpen={isOpen} position="bottom" title="🛡️ Shields" onClose={onClose}>
      <p className="text-sm font-bold text-muted mt-1">
        While your shield is up, no tribe can attack you. Barbarian camps are still fair game.
      </p>

      <p
        className={clsx(
          "mt-3 text-center text-sm font-extrabold rounded-xl px-3 py-2 border",
          shielded ? "text-good border-good/40 bg-panel2" : "text-bad border-bad/40 bg-panel2"
        )}
      >
        {shielded ? `✅ Shielded · ${formatDuration(state.shieldUntil - now)} left` : "⚠️ No shield: rivals can raid you"}
      </p>

      {/* Free weekly shield with Plus */}
      <div className="flex items-center gap-3 bg-panel2 border border-gold rounded-xl px-3 py-2.5 mt-4">
        <span aria-hidden className="text-2xl w-8 text-center">
          👑
        </span>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="font-extrabold leading-tight">Weekly Plus shield · {PLUS.weeklyShieldHours}h</span>
          <span className="text-xs font-bold text-muted">
            {plusOn ? (weeklyBlocked ?? "Free, ready now") : "Free every week with Valorians Plus"}
          </span>
        </span>
        {plusOn ? (
          <Button disabled={!!busy || !!weeklyBlocked} size="small" onClick={() => run("plus", shields.claimPlus)}>
            {busy === "plus" ? "…" : "Raise"}
          </Button>
        ) : (
          <Button
            size="small"
            variant="outline"
            onClick={() => {
              onClose();
              onOpenPlus();
            }}
          >
            Get Plus
          </Button>
        )}
      </div>

      {/* Shields for Stars */}
      <ul className="flex flex-col gap-2 mt-2">
        {SHIELDS.options.map((o) => {
          const blocked = shieldBlocked(state, o.hours, now);

          return (
            <li key={o.id} className="flex items-center gap-3 bg-panel2 border border-line rounded-xl px-3 py-2.5">
              <span aria-hidden className="text-2xl w-8 text-center">
                🛡️
              </span>
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="font-extrabold leading-tight">{label(o.hours)}</span>
                {blocked && <span className="text-xs font-bold text-muted">{blocked}</span>}
              </span>
              <Button disabled={!!busy || !!blocked} size="small" onClick={() => run(o.id, () => shields.buy(o.id))}>
                {busy === o.id ? "Opening…" : `⭐ ${o.stars}`}
              </Button>
            </li>
          );
        })}
      </ul>

      <ul className="mt-4 flex flex-col gap-1 text-xs font-bold text-muted">
        <li>⚔️ Sending an army against another tribe breaks your shield.</li>
        <li>
          ⏳ After a shield ends, the next one needs {cooldownHours}h to recharge
          {recharging && !shielded ? ` (${formatDuration(state.shield.cooldownUntil - now)} left)` : ""}.
        </li>
        <li>🔥 Being raided always gives you a short free shield.</li>
      </ul>
    </Drawer>
  );
};
