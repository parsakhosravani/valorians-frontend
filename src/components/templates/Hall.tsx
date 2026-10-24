"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";

import { RESOURCES, useGame, useTelegramContext } from "@/context";
import { apiRequest } from "@/lib/api";
import { compact, formatDuration } from "@/lib/format";
import { BUILDINGS, RESOURCE_IDS, STAMINA_PER_TAP, STREAK_REWARDS } from "@/lib/game/config";
import { buildingUpgradeInfo, getRates, streakStatus } from "@/lib/game/engine";
import { campStatus, powerScore } from "@/lib/game/war";
import useBackButtonReset from "@/hooks/useBackButtonReset";
import { CastlePreview } from "@/components/organisms/tribe/Diorama";
import { Amount, Badge, Card, Icon, Overline } from "@/components/ui";
import { GameIcon, GameIconId } from "@/art";

type ReportItem = {
  id: number;
  at: number;
  role: "attacker" | "defender";
  won: boolean;
  opponent: string;
  opponentId: number | null;
  report: { loot: Record<string, number> };
};

type TileProps = {
  icon: GameIconId;
  title: string;
  sub: string;
  hot?: boolean;
  badge?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
};

/** One of the four big actions. "Hot" ones glow so the next step is obvious. */
const Tile = ({ icon, title, sub, hot, badge, href, onClick, disabled }: TileProps) => {
  const body = (
    <div className="relative flex items-center gap-3">
      <span
        className={clsx(
          "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border",
          hot ? "bg-gradient-to-b from-gold-300/30 to-gold-500/10 border-gold-500" : "bg-ink-700 border-ink-500"
        )}
      >
        <GameIcon id={icon} size={34} />
      </span>
      <span className="flex flex-col min-w-0 flex-1">
        <span className="font-display font-bold text-display-md leading-tight">{title}</span>
        <span className={clsx("text-small font-bold leading-snug", hot ? "text-gold-300" : "text-parch-500")}>{sub}</span>
      </span>
      <Icon className={hot ? "text-gold-300" : "text-parch-700"} name="chevron" />
      {badge && <Badge className="absolute -top-4 -right-2 border-2 border-ink-900" tone="ember">{badge}</Badge>}
    </div>
  );

  if (disabled) {
    return (
      <Card className="opacity-70" tone="default">
        {body}
      </Card>
    );
  }

  return (
    <Card href={href} tone={hot ? "gold" : "default"} onClick={href ? undefined : onClick}>
      {body}
    </Card>
  );
};

export const Hall = () => {
  useBackButtonReset();
  const { telegram } = useTelegramContext();
  const { state, rates, now, me, authHeader, claimStreak } = useGame();
  const [news, setNews] = useState<ReportItem | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!authHeader) return;
    apiRequest<{ reports: ReportItem[] }>(authHeader, "war/reports")
      .then((r) => setNews(r.reports.find((x) => x.role === "defender" && now - x.at < 24 * 3600e3) ?? null))
      .catch(() => {});
  }, [authHeader]);

  const streak = streakStatus(state, now);
  const reward = STREAK_REWARDS[streak.next - 1];
  const strikes = Math.floor(state.energy / STAMINA_PER_TAP);
  const freeBuilders = rates.builders - state.queue.length;
  const ready = BUILDINGS.filter((b) => {
    const info = buildingUpgradeInfo(state, b.id);

    return (
      (state.buildings[b.id] ?? 0) > 0 &&
      !info.maxed &&
      !state.queue.some((q) => q.building === b.id) &&
      RESOURCE_IDS.every((r) => state.resources[r] >= info.cost)
    );
  }).length;
  const nextJob = [...state.queue].sort((a, b) => a.endsAt - b.endsAt)[0];
  const campReady = campStatus(state, state.camps.cleared + 1, now).state === "new";
  const armyHome = Object.values(state.army).reduce((a, b) => a + b, 0);
  const shielded = state.shieldUntil > now;

  const onClaim = async () => {
    setClaiming(true);
    const ok = await claimStreak();

    setClaiming(false);
    if (ok) telegram?.WebApp.HapticFeedback.notificationOccurred("success");
  };

  const loot = news ? Object.values(news.report.loot ?? {}).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="flex flex-col gap-3 pb-2">
      {/* Hero: your own island */}
      <section className="relative">
        <CastlePreview height={260} />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ink-900 via-ink-900/80 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 px-4 pb-1 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display font-extrabold text-display-xl leading-none truncate [text-shadow:0_2px_8px_#000]">
              {me.firstName || "Your tribe"}
            </h1>
            <p className="mt-1.5 flex gap-3 [text-shadow:0_1px_3px_#000]">
              <Amount icon="attack" value={powerScore(state)} />
              <Amount icon="population" value={state.population} />
            </p>
          </div>
          <Link
            className="shrink-0 flex flex-col items-center px-3 py-1.5 rounded-2xl bg-ink-800/90 border border-gold-500 shadow-glow"
            href="/leaderboard"
          >
            <Overline>Rank</Overline>
            <span className="font-display font-extrabold text-display-md leading-none text-gold-300">#{me.rank}</span>
          </Link>
        </div>
      </section>

      {/* Stock at a glance */}
      <div className="grid grid-cols-4 gap-1.5 px-4">
        {RESOURCES.map((r) => {
          const perHour = rates.productionPerHour[r.id];

          return (
            <div key={r.id} className="flex items-center gap-1.5 bg-ink-800 border border-ink-500/70 rounded-xl px-2 py-1.5 shadow-card">
              <GameIcon id={r.id} size={22} title={r.name} />
              <div className="flex flex-col leading-none min-w-0">
                <span className="text-small font-extrabold">{compact(state.resources[r.id])}</span>
                <span className={clsx("text-[10px] font-bold", perHour < 0 ? "text-blood-400" : "text-moss-400")}>
                  {perHour >= 0 ? "+" : ""}
                  {compact(perHour)}/h
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* The four things to do */}
      <div className="grid grid-cols-1 gap-2.5 px-4">
        <Tile
          disabled={!streak.claimable || claiming}
          hot={streak.claimable}
          icon="chest"
          sub={
            streak.claimable
              ? `Day ${streak.next} · ${compact(reward.coins)} coins${reward.resources ? " + chest" : ""}`
              : `Day ${streak.current} done · back tomorrow`
          }
          title={streak.claimable ? "Claim daily reward" : "Reward claimed"}
          onClick={onClaim}
        />
        <Tile
          hot={strikes > 0}
          href="/resources"
          icon="energy"
          sub={strikes > 0 ? `${strikes} strikes left today` : "Miners rest until dawn (UTC)"}
          title="Daily Mine"
        />
        <Tile
          badge={ready ? String(ready) : undefined}
          hot={freeBuilders > 0 && ready > 0}
          href="/tribe"
          icon="builder"
          sub={
            freeBuilders > 0
              ? ready
                ? `${ready} upgrade${ready > 1 ? "s" : ""} ready · ${freeBuilders} builder${freeBuilders > 1 ? "s" : ""} free`
                : `${freeBuilders} builder${freeBuilders > 1 ? "s" : ""} free`
              : `All builders busy · ${formatDuration(nextJob.endsAt - now)}`
          }
          title="Build"
        />
        <Tile
          hot={armyHome > 0 && (campReady || !shielded)}
          href={news && !news.won && news.opponentId ? `/battle?revenge=${news.opponentId}` : "/battle"}
          icon="attack"
          sub={
            armyHome === 0
              ? "Train an army first"
              : campReady
              ? `Barbarian camp ${state.camps.cleared + 1} awaits`
              : "Raid a tribe for loot"
          }
          title="Raid"
        />
      </div>

      {/* One line of news */}
      {news && (
        <Link
          className={clsx(
            "mx-4 flex items-center gap-2.5 rounded-2xl px-3 py-2.5 border text-small font-bold",
            news.won ? "bg-ink-800 border-ink-500" : "bg-gradient-to-br from-ember-900 to-ink-800 border-ember-700"
          )}
          href={news.won || !news.opponentId ? "/battle" : (`/battle?revenge=${news.opponentId}` as any)}
        >
          <GameIcon id={news.won ? "defense" : "attack"} size={22} />
          <span className="flex-1 min-w-0 truncate">
            {news.won
              ? `${news.opponent} attacked you and lost`
              : `${news.opponent} raided you and took ${compact(loot)}`}
          </span>
          <span className={clsx("shrink-0 font-extrabold", news.won ? "text-parch-500" : "text-ember-300")}>
            {news.won ? formatDuration(now - news.at) + " ago" : "Revenge ›"}
          </span>
        </Link>
      )}

      {shielded && (
        <p className="flex items-center justify-center gap-1.5 text-caption font-bold text-parch-500">
          <GameIcon id="shield-time" size={16} />
          Protected by a shield for {formatDuration(state.shieldUntil - now)}
        </p>
      )}
      <p className="sr-only">Coins per hour: {compact(getRates(state).coinsPerHour)}</p>
    </div>
  );
};
