"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";

import { RESOURCES, useGame, useTelegramContext } from "@/context";
import { apiRequest } from "@/lib/api";
import { compact, formatDuration } from "@/lib/format";
import { BUILDINGS, RESOURCE_IDS, STAMINA_PER_TAP, STREAK_REWARDS } from "@/lib/game/config";
import { buildingUpgradeInfo, getRates, streakStatus } from "@/lib/game/engine";
import { campStatus, powerScore } from "@/lib/game/war";
import useBackButtonReset from "@/hooks/useBackButtonReset";
import { IslandPreview } from "@/components/organisms/tribe/Diorama";

type ReportItem = {
  id: number;
  at: number;
  role: "attacker" | "defender";
  won: boolean;
  opponent: string;
  opponentId: number | null;
  report: { loot: Record<string, number> };
};

const Svg = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    height="30"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="30"
  >
    {children}
  </svg>
);

const ICONS = {
  claim: (
    <Svg>
      <rect height="12" rx="1.5" width="18" x="3" y="9" />
      <path d="M3 13h18M12 9v12M12 9c-1.5-3-6-4-6-1s4 1 6 1zM12 9c1.5-3 6-4 6-1s-4 1-6 1z" />
    </Svg>
  ),
  mine: (
    <Svg>
      <path d="M14 4c3 0 6 2 7 5M3 21l9-9M10 4c-3 0-6 2-7 5" />
      <path d="M14 4 10 4l2 8z" />
    </Svg>
  ),
  build: (
    <Svg>
      <path d="m15 12-8.5 8.5a2.1 2.1 0 1 1-3-3L12 9" />
      <path d="M17.6 6.4 20 4M14 4l6 6-4 4-6-6z" />
    </Svg>
  ),
  raid: (
    <Svg>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" />
      <path d="M9.5 17.5 21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4M5 21l-2-2" />
    </Svg>
  ),
};

type TileProps = {
  icon: React.ReactNode;
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
    <>
      <span
        className={clsx(
          "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border-2",
          hot ? "bg-gold text-[#1A120B] border-[#FBE3A6]" : "bg-panel2 text-goldtext border-line"
        )}
      >
        {icon}
      </span>
      <span className="flex flex-col min-w-0 text-left">
        <span className="font-display font-black text-[17px] leading-tight">{title}</span>
        <span className={clsx("text-[13px] font-bold leading-snug", hot ? "text-goldtext" : "text-sub")}>{sub}</span>
      </span>
      {badge && (
        <span className="absolute -top-2 -right-1 min-w-6 h-6 px-1.5 rounded-full bg-ember text-[#FFF4EA] text-xs font-black flex items-center justify-center border-2 border-ground">
          {badge}
        </span>
      )}
    </>
  );
  const cls = clsx(
    "relative flex items-center gap-3 p-3 rounded-2xl border transition-transform active:scale-[0.97]",
    hot
      ? "bg-gradient-to-br from-[#3A2915] to-panel border-gold shadow-[0_0_22px_rgba(227,169,72,0.22)]"
      : "bg-panel border-line",
    disabled && "opacity-60"
  );

  return href ? (
    <Link className={cls} href={href as any}>
      {body}
    </Link>
  ) : (
    <button className={cls} disabled={disabled} onClick={onClick}>
      {body}
    </button>
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
        <IslandPreview height={260} />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ground via-ground/80 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 px-4 pb-1 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display font-black text-[28px] leading-none truncate [text-shadow:0_2px_6px_#000]">
              {me.firstName || "Your tribe"}
            </h1>
            <p className="mt-1 text-sm font-extrabold text-goldtext [text-shadow:0_1px_3px_#000]">
              Power {compact(powerScore(state))} · Pop. {compact(state.population)}
            </p>
          </div>
          <Link
            className="shrink-0 flex flex-col items-center px-3 py-1.5 rounded-xl bg-panel/90 border border-gold"
            href="/leaderboard"
          >
            <span className="text-[10px] font-extrabold tracking-[0.12em] text-muted">RANK</span>
            <span className="font-display font-black text-lg leading-none text-goldtext">#{me.rank}</span>
          </Link>
        </div>
      </section>

      {/* Stock at a glance */}
      <div className="grid grid-cols-4 gap-1.5 px-4">
        {RESOURCES.map((r) => {
          const perHour = rates.productionPerHour[r.id];

          return (
            <div key={r.id} className="flex items-center gap-1.5 bg-panel border border-line rounded-xl px-2 py-1.5">
              <Image alt={r.name} className="w-5 h-5 shrink-0" src={r.img} />
              <div className="flex flex-col leading-none min-w-0">
                <span className="text-[13px] font-extrabold">{compact(state.resources[r.id])}</span>
                <span className={clsx("text-[10px] font-bold", perHour < 0 ? "text-bad" : "text-good")}>
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
          icon={ICONS.claim}
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
          icon={ICONS.mine}
          sub={strikes > 0 ? `${strikes} strikes left today` : "Miners rest until dawn (UTC)"}
          title="Daily Mine"
        />
        <Tile
          badge={ready ? String(ready) : undefined}
          hot={freeBuilders > 0 && ready > 0}
          href="/tribe"
          icon={ICONS.build}
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
          icon={ICONS.raid}
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
            "mx-4 flex items-center gap-2 rounded-xl px-3 py-2.5 border text-sm font-bold",
            news.won ? "bg-panel border-line" : "bg-[#2A140E] border-[#8A3B23]"
          )}
          href={news.won || !news.opponentId ? "/battle" : (`/battle?revenge=${news.opponentId}` as any)}
        >
          <span className="flex-1 min-w-0 truncate">
            {news.won
              ? `${news.opponent} attacked you and lost`
              : `${news.opponent} raided you and took ${compact(loot)}`}
          </span>
          <span className={clsx("shrink-0 font-black", news.won ? "text-muted" : "text-[#FFB27A]")}>
            {news.won ? formatDuration(now - news.at) + " ago" : "Revenge ›"}
          </span>
        </Link>
      )}

      {shielded && (
        <p className="text-center text-xs font-bold text-muted">
          Protected by a shield for {formatDuration(state.shieldUntil - now)}
        </p>
      )}
      <p className="sr-only">Coins per hour: {compact(getRates(state).coinsPerHour)}</p>
    </div>
  );
};
