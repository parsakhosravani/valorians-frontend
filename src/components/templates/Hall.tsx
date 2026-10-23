"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";

import bg from "~/images/background/tribe.webp";

import { RESOURCES, useGame } from "@/context";
import { apiRequest } from "@/lib/api";
import { compact, formatDuration } from "@/lib/format";
import { STREAK_REWARDS } from "@/lib/game/config";
import { buildingUpgradeInfo, getRates, questStatus, streakStatus } from "@/lib/game/engine";
import { BUILDINGS, RESOURCE_IDS } from "@/lib/game/config";
import useBackButtonReset from "@/hooks/useBackButtonReset";
import { Button } from "@/components";
import { ACTIVE_QUESTS } from "@/components/organisms/quest/QuestDrawer";

type ReportItem = {
  id: number;
  at: number;
  role: "attacker" | "defender";
  won: boolean;
  opponent: string;
  opponentId: number | null;
  report: { loot: Record<string, number> };
};

const Icon = ({ d, className }: { d: string; className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    height="22"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="22"
  >
    <path d={d} />
  </svg>
);

const ICON = {
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  swords: "M14.5 17.5 3 6V3h3l11.5 11.5M9.5 17.5 21 6V3h-3L6.5 14.5",
  hammer: "m15 12-8.5 8.5a2.1 2.1 0 1 1-3-3L12 9M17.6 6.4 20 4M14 4l6 6-4 4-6-6z",
  scroll: "M8 3h11v15a3 3 0 0 1-3 3H6M8 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3M11 8h5M11 12h5",
};

const FeedRow = ({
  href,
  icon,
  tone = "normal",
  title,
  sub,
  action,
}: {
  href: string;
  icon: string;
  tone?: "normal" | "alert";
  title: string;
  sub: string;
  action?: string;
}) => (
  <Link
    className={clsx(
      "flex items-center gap-3 rounded-2xl p-3 border",
      tone === "alert" ? "bg-[#2A140E] border-[#8A3B23]" : "bg-panel border-line"
    )}
    href={href as any}
  >
    <Icon className={tone === "alert" ? "text-bad shrink-0" : "text-goldtext shrink-0"} d={icon} />
    <div className="flex-1 min-w-0 flex flex-col">
      <span className="font-extrabold text-sm leading-snug">{title}</span>
      <span className="text-xs text-sub">{sub}</span>
    </div>
    {action && <span className="font-extrabold text-sm text-[#FFB27A] shrink-0">{action}</span>}
  </Link>
);

export const Hall = () => {
  useBackButtonReset();
  const { state, rates, now, me, authHeader, claimStreak } = useGame();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [claiming, setClaiming] = useState(false);
  const streak = streakStatus(state, now);

  useEffect(() => {
    if (!authHeader) return;
    apiRequest<{ reports: ReportItem[] }>(authHeader, "war/reports")
      .then((r) => setReports(r.reports.slice(0, 3)))
      .catch(() => {});
  }, [authHeader]);

  const freeBuilders = rates.builders - state.queue.length;
  const affordable = BUILDINGS.filter((b) => {
    const info = buildingUpgradeInfo(state, b.id);

    return !info.maxed && !state.queue.some((q) => q.building === b.id) && RESOURCE_IDS.every((r) => state.resources[r] >= info.cost);
  });
  const questsLeft = ACTIVE_QUESTS.filter((q) => questStatus(state, q.id, now).state !== "claimed").length;
  const staminaTaps = Math.floor(state.energy / 10);

  const onClaim = async () => {
    setClaiming(true);
    await claimStreak();
    setClaiming(false);
  };

  return (
    <>
      <Image
        priority
        alt=""
        className="absolute left-0 top-0 w-full h-[300px] object-cover opacity-60 -z-10"
        src={bg}
      />
      <div className="absolute left-0 top-0 w-full h-[300px] bg-gradient-to-b from-ground/10 via-ground/60 to-ground -z-10" />

      <div className="flex flex-col gap-3 px-4 pt-16">
        <div>
          <h1 className="font-display font-black text-3xl leading-tight">Hall of {me.firstName || "your tribe"}</h1>
          <p className="text-sub font-bold text-sm">Your tribe grows while you&apos;re away.</p>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {RESOURCES.map((r) => {
            const perHour = rates.productionPerHour[r.id];

            return (
              <div key={r.id} className="bg-panel border border-line rounded-xl py-2 flex flex-col items-center">
                <Image alt={r.name} className="w-6 h-6" src={r.img} />
                <span className="font-extrabold text-sm">{compact(state.resources[r.id])}</span>
                <span className={clsx("text-[11px] font-bold", perHour < 0 ? "text-bad" : "text-good")}>
                  {perHour >= 0 ? "+" : ""}
                  {Math.round(perHour)}/h
                </span>
              </div>
            );
          })}
        </div>

        {/* Daily streak */}
        <section className="bg-panel border border-gold rounded-2xl p-3 flex flex-col gap-2.5">
          <div className="flex justify-between items-center gap-2">
            <div className="flex flex-col">
              <span className="font-display font-bold">
                {streak.claimable ? `Day ${streak.next} reward` : `Day ${streak.current} claimed`}
              </span>
              <span className="text-xs text-sub">
                {streak.claimable ? "Come back daily — miss a day and it starts over." : "Come back tomorrow for the next one."}
              </span>
            </div>
            <Button disabled={!streak.claimable || claiming} size="small" onClick={onClaim}>
              {streak.claimable ? "Claim" : "Claimed"}
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-extrabold">
            {STREAK_REWARDS.map((rw, i) => {
              const day = i + 1;
              const done = streak.claimable ? day < streak.next : day <= streak.current;
              const today = streak.claimable && day === streak.next;

              return (
                <div
                  key={day}
                  className={clsx(
                    "rounded-lg py-1.5 leading-tight",
                    done && "bg-[#3B2A1A] text-muted",
                    today && "bg-gold text-[#1A120B]",
                    !done && !today && "bg-panel2",
                    day === 7 && !done && !today && "border border-ember text-[#FFB27A]"
                  )}
                >
                  {day}
                  <br />
                  {done ? "✓" : day === 7 ? "Chest" : compact(rw.coins)}
                </div>
              );
            })}
          </div>
        </section>

        {/* What happened */}
        <h2 className="text-xs tracking-[0.14em] font-extrabold text-muted mt-1">YOUR TRIBE NOW</h2>
        {reports.map((r) => {
          const loot = Object.values(r.report.loot ?? {}).reduce((a, b) => a + b, 0);
          const ago = `${formatDuration(now - r.at)} ago`;

          if (r.role === "defender") {
            return (
              <FeedRow
                key={r.id}
                action={!r.won && r.opponentId ? "Revenge" : undefined}
                href={r.opponentId && !r.won ? `/battle?revenge=${r.opponentId}` : "/battle"}
                icon={ICON.shield}
                sub={`${r.won ? "Your defenders held" : "Build walls and train spearmen"} · ${ago}`}
                title={r.won ? `${r.opponent} attacked and failed` : `${r.opponent} raided you and took ${compact(loot)}`}
                tone={r.won ? "normal" : "alert"}
              />
            );
          }

          return (
            <FeedRow
              key={r.id}
              href="/battle"
              icon={ICON.swords}
              sub={ago}
              title={r.won ? `You beat ${r.opponent}${loot ? ` and took ${compact(loot)}` : ""}` : `Your attack on ${r.opponent} failed`}
            />
          );
        })}
        {state.marches.map((m) => (
          <FeedRow
            key={m.id}
            href="/battle"
            icon={ICON.arrow}
            sub={`Home in ${formatDuration(m.returnsAt - now)}`}
            title={`Army returning from ${m.target}`}
          />
        ))}
        {state.queue.map((q) => (
          <FeedRow
            key={q.building}
            href="/tribe"
            icon={ICON.hammer}
            sub={`${formatDuration(q.endsAt - now)} left`}
            title={`${BUILDINGS.find((b) => b.id === q.building)?.name} → level ${q.toLevel}`}
          />
        ))}
        {freeBuilders > 0 && (
          <FeedRow
            action="Build"
            href="/tribe"
            icon={ICON.hammer}
            sub={affordable.length ? `${affordable[0].name} is affordable now` : "Gather more resources to upgrade"}
            title={`${freeBuilders} builder${freeBuilders > 1 ? "s" : ""} idle`}
          />
        )}
        {questsLeft > 0 && (
          <FeedRow
            href="/quest"
            icon={ICON.scroll}
            sub="Each one pays coins and population"
            title={`${questsLeft} saga task${questsLeft > 1 ? "s" : ""} to complete`}
          />
        )}

        <div className="grid grid-cols-2 gap-2 mt-1">
          <Link className="rounded-2xl p-3 bg-panel2 border border-gold flex flex-col" href="/resources">
            <span className="font-display font-black text-goldtext">Daily Mine</span>
            <span className="text-xs text-sub">
              {staminaTaps > 0 ? `${staminaTaps} strikes left today` : "Rested — back at dawn (UTC)"}
            </span>
          </Link>
          <Link className="rounded-2xl p-3 bg-panel2 border border-line flex flex-col" href="/battle">
            <span className="font-display font-black">War</span>
            <span className="text-xs text-sub">
              {state.shieldUntil > now ? `Shielded ${formatDuration(state.shieldUntil - now)}` : "Raid a tribe or a camp"}
            </span>
          </Link>
        </div>
        <p className="text-[11px] text-muted text-center pb-2">
          Population {compact(state.population)} · +{Math.round(rates.growthPerHour)}/h · Coins +
          {compact(getRates(state).coinsPerHour)}/h
        </p>
      </div>
    </>
  );
};
