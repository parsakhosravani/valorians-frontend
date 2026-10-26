"use client";
import { useState } from "react";

import { Button, Drawer } from "@/components";
import { useGame } from "@/context";
import { formatDuration } from "@/lib/format";
import { PLUS } from "@/lib/game/config";
import { plusActive } from "@/lib/game/engine";
import { GameIcon } from "@/components/atoms/GameIcon";

const PERKS = [
  { icon: "🔨", title: `+${PLUS.extraBuilders} builder`, sub: "One more building goes up at the same time" },
  { icon: "⚔️", title: `+${PLUS.extraTrainBatches} training slots`, sub: "Queue more batches in the barracks" },
  { icon: "🛡️", title: `Free ${PLUS.weeklyShieldHours}h shield every week`, sub: "Raise it from the Hall whenever you're away" },
  { icon: "👑", title: "The Plus crown", sub: "Shown next to your name and on the leaderboard" },
];

const trialDays = Math.round(PLUS.trialMs / 86400e3);

/** What Valorians Plus gives, with the free trial and the Stars subscription. */
export const PlusDrawer = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const { state, now, me, plus } = useGame();
  const [busy, setBusy] = useState<"trial" | "pay" | null>(null);
  const active = plusActive(state);
  const canTrial = !active && !state.plus.trialUsed;

  const run = async (key: "trial" | "pay", fn: () => Promise<boolean>) => {
    setBusy(key);
    const ok = await fn();

    setBusy(null);
    if (ok) onClose();
  };

  return (
    <Drawer isOpen={isOpen} position="bottom" title="👑 Valorians Plus" onClose={onClose}>
      <p className="text-sm font-bold text-muted mt-1">
        Rule your tribe with more hands at work. Plus speeds up your day, it never buys victories.
      </p>

      <ul className="flex flex-col gap-2 mt-4">
        {PERKS.map((p) => (
          <li key={p.title} className="flex items-center gap-3 bg-panel2 border border-line rounded-xl px-3 py-2.5">
            <span aria-hidden className="text-2xl w-8 text-center">
              <GameIcon e={p.icon} />
            </span>
            <span className="flex flex-col">
              <span className="font-extrabold leading-tight">{p.title}</span>
              <span className="text-xs font-bold text-muted">{p.sub}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 mt-5">
        {active ? (
          <>
            <p className="text-center font-extrabold text-good">
              ✅ Plus is active · {formatDuration(state.plus.until - now)} left
            </p>
            {state.plus.paid ? (
              <p className="text-center text-xs font-bold text-muted">
                Your subscription renews by itself. Manage or cancel it in Telegram under Settings → My Stars.
              </p>
            ) : (
              <Button isFull disabled={!!busy} onClick={() => run("pay", plus.subscribe)}>
                {busy === "pay" ? "Opening…" : `Keep Plus · ⭐ ${me.plusPrice} Stars / month`}
              </Button>
            )}
          </>
        ) : (
          <>
            {canTrial && (
              <Button isFull disabled={!!busy} size="large" onClick={() => run("trial", plus.trial)}>
                {busy === "trial" ? "Starting…" : `Try free for ${trialDays} days`}
              </Button>
            )}
            <Button
              isFull
              disabled={!!busy}
              size={canTrial ? "medium" : "large"}
              variant={canTrial ? "outline" : "primary"}
              onClick={() => run("pay", plus.subscribe)}
            >
              {busy === "pay" ? "Opening…" : `Subscribe · ⭐ ${me.plusPrice} Stars / month`}
            </Button>
            <p className="text-center text-xs font-bold text-muted">
              Paid with Telegram Stars. Renews monthly, cancel anytime.
            </p>
          </>
        )}
      </div>
    </Drawer>
  );
};
