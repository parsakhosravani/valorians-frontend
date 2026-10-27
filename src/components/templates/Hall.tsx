"use client";
import { useEffect, useMemo, useState } from "react";
import Image, { StaticImageData } from "next/image";
import Link from "next/link";
import clsx from "clsx";

import coinImg from "~/images/resources/coin.webp";
import timeImg from "~/images/resources/time.webp";

import { ACTIVE_QUESTS, QUEST_ICONS } from "@/components/organisms/quest/QuestDrawer";
import { RESOURCES, useGame, useTelegramContext } from "@/context";
import { apiRequest } from "@/lib/api";
import { compact, formatDuration } from "@/lib/format";
import { BUILDING_BY_ID, STAMINA_PER_TAP, STREAK_REWARDS, buildingImage } from "@/lib/game/config";
import { questStatus, streakStatus, trainingEndsAt } from "@/lib/game/engine";
import { campReward, campStatus, powerScore } from "@/lib/game/war";
import { recommendUpgrade, upgradeOptions } from "@/lib/game/advice";
import useBackButtonReset from "@/hooks/useBackButtonReset";
import dynamic from "next/dynamic";

// Opened from buttons, so they load separately from the page.
const PlusDrawer = dynamic(() => import("@/components/organisms/PlusDrawer").then((m) => m.PlusDrawer));
const ShieldDrawer = dynamic(() => import("@/components/organisms/ShieldDrawer").then((m) => m.ShieldDrawer));
import { plusActive } from "@/lib/game/engine";
import { GameIcon } from "@/components/atoms/GameIcon";
import { Bar, SectionTitle } from "@/components/atoms/Ui";

type ReportItem = {
  id: number;
  at: number;
  role: "attacker" | "defender";
  won: boolean;
  opponent: string;
  opponentId: number | null;
  report: { loot: Record<string, number> };
};

type Task = {
  key: string;
  img: StaticImageData | string;
  title: string;
  sub?: string;
  /** done = checked off; wait = in progress, nothing to do yet. */
  state: "todo" | "done" | "wait";
  tone?: "gold" | "danger";
  action?: { label: string; href?: string; onClick?: () => void; busy?: boolean };
};

const TaskRow = ({ t }: { t: Task }) => {
  const done = t.state === "done";

  return (
    <li className={clsx("flex items-center gap-3 py-2.5", done && "opacity-55")}>
      <span
        className={clsx(
          "w-6 h-6 rounded-full shrink-0 flex items-center justify-center border-2",
          done ? "bg-good border-good text-[#1A120B]" : t.state === "wait" ? "border-muted/70 border-dashed" : "border-gold shadow-[0_0_8px_rgba(227,169,72,0.35)]"
        )}
      >
        {done && (
          <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" viewBox="0 0 24 24" width="14">
            <path d="m5 12.5 4.5 4.5L19 7" />
          </svg>
        )}
      </span>
      <Image alt="" className="w-10 h-10 object-contain shrink-0 rounded-lg" height={80} src={t.img} width={80} />
      <span className="flex-1 min-w-0 flex flex-col">
        <span className={clsx("font-bold leading-tight", done && "line-through decoration-muted")}>{t.title}</span>
        {t.sub && <span className={clsx("text-xs font-bold", t.tone === "danger" ? "text-[#FFB27A]" : "text-muted")}>{t.sub}</span>}
      </span>
      {t.action &&
        !done &&
        (t.action.href ? (
          <Link
            className={clsx(
              "btn btn-sm shrink-0",
              t.tone === "danger" ? "btn-ember" : t.tone === "gold" ? "btn-gold" : "btn-wood text-goldtext"
            )}
            href={t.action.href as any}
          >
            {t.action.label}
          </Link>
        ) : (
          <button className="btn btn-sm btn-gold shrink-0" disabled={t.action.busy} onClick={t.action.onClick}>
            {t.action.label}
          </button>
        ))}
    </li>
  );
};

export const Hall = () => {
  useBackButtonReset();
  const { telegram } = useTelegramContext();
  const { state, rates, now, me, authHeader, claimStreak, upgradeBuilding } = useGame();
  const [news, setNews] = useState<ReportItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [shieldOpen, setShieldOpen] = useState(false);

  // The bot's /plus button opens the game on /hall?plus=1 (and /hall?shield=1 for shields).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);

    if (q.get("plus")) setPlusOpen(true);
    else if (q.get("shield")) setShieldOpen(true);
  }, []);

  useEffect(() => {
    if (!authHeader) return;
    apiRequest<{ reports: ReportItem[] }>(authHeader, "war/reports")
      .then((r) => setNews(r.reports.find((x) => x.role === "defender" && !x.won && now - x.at < 24 * 3600e3) ?? null))
      .catch(() => {});
  }, [authHeader]);

  const run = async (key: string, fn: () => Promise<boolean>) => {
    setBusy(key);
    const ok = await fn();

    setBusy(null);
    if (ok) telegram?.WebApp.HapticFeedback.notificationOccurred("success");
  };

  const options = useMemo(() => upgradeOptions(state), [state]);
  const tasks: Task[] = [];

  // 1. Daily reward
  const streak = streakStatus(state, now);
  const reward = STREAK_REWARDS[streak.next - 1];

  tasks.push(
    streak.claimable
      ? {
          key: "streak",
          img: coinImg,
          title: `Claim day ${streak.next} reward`,
          sub: `${compact(reward.coins)} coins${reward.resources ? " + resource chest" : ""}`,
          state: "todo",
          tone: "gold",
          action: { label: "Claim", onClick: () => run("streak", claimStreak), busy: busy === "streak" },
        }
      : { key: "streak", img: coinImg, title: `Day ${streak.current} reward claimed`, sub: "Come back tomorrow", state: "done" }
  );

  // 2. Revenge
  if (news?.opponentId) {
    const lost = Object.values(news.report.loot ?? {}).reduce((a, b) => a + b, 0);

    tasks.push({
      key: "revenge",
      img: buildingImage(BUILDING_BY_ID["war-hall"]),
      title: `Take revenge on ${news.opponent}`,
      sub: `Raided you ${formatDuration(now - news.at)} ago · took ${compact(lost)}`,
      state: "todo",
      tone: "danger",
      action: { label: "Revenge", href: `/battle?revenge=${news.opponentId}` },
    });
  }

  // 3. Build
  const advice = recommendUpgrade(state, options);
  const freeBuilders = rates.builders - state.queue.length;

  if (advice) {
    const o = options.find((x) => x.building.id === advice.id)!;

    tasks.push({
      key: "build",
      img: buildingImage(o.building),
      title: `${o.level === 0 ? "Build" : "Upgrade"} ${o.building.name} to ${o.toLevel}`,
      sub: `${advice.reason} · ${compact(o.cost)} each`,
      state: "todo",
      tone: "gold",
      action: { label: o.level === 0 ? "Build" : "Upgrade", onClick: () => run("build", () => upgradeBuilding(o.building.id)), busy: busy === "build" },
    });
  } else if (freeBuilders <= 0) {
    const next = [...state.queue].sort((a, b) => a.endsAt - b.endsAt)[0];

    tasks.push({
      key: "build",
      img: buildingImage(BUILDING_BY_ID[next.building]),
      title: `${BUILDING_BY_ID[next.building].name} → ${next.toLevel} under way`,
      sub: `Builders busy · next done in ${formatDuration(next.endsAt - now)}`,
      state: "wait",
      action: { label: "View", href: "/tribe" },
    });
  } else {
    const soonest = options
      .filter((o) => !o.maxed && !o.job && o.hoursToAfford !== null)
      .sort((a, b) => (a.hoursToAfford ?? 0) - (b.hoursToAfford ?? 0))[0];

    if (soonest) {
      tasks.push({
        key: "build",
        img: buildingImage(soonest.building),
        title: `Save up for ${soonest.building.name} ${soonest.toLevel}`,
        sub: `Affordable in ~${formatDuration((soonest.hoursToAfford ?? 0) * 3600e3)} · or mine to speed it up`,
        state: "wait",
        action: { label: "View", href: "/tribe" },
      });
    }
  }

  // 4. Daily Mine
  const strikes = Math.floor(state.energy / STAMINA_PER_TAP);

  tasks.push(
    strikes > 0
      ? {
          key: "mine",
          img: RESOURCES[0].img,
          title: "Strike in the Daily Mine",
          sub: `${strikes} strikes left today`,
          state: "todo",
          action: { label: "Mine", href: "/resources" },
        }
      : { key: "mine", img: RESOURCES[0].img, title: "Mined today", sub: "Stamina refills at dawn (UTC)", state: "done" }
  );

  // 5. Army
  const barracks = state.buildings["barracks"] ?? 0;
  const armyHome = Object.values(state.army).reduce((a, b) => a + b, 0);

  if (barracks === 0) {
    tasks.push({
      key: "army",
      img: buildingImage(BUILDING_BY_ID["barracks"]),
      title: "Build Barracks to train troops",
      sub: "Troops raid camps and defend your tribe",
      state: "todo",
      action: { label: "Go", href: "/tribe" },
    });
  } else if (state.training.length) {
    const end = Math.max(...state.training.map(trainingEndsAt));

    tasks.push({
      key: "army",
      img: buildingImage(BUILDING_BY_ID["barracks"]),
      title: "Troops in training",
      sub: `All done in ${formatDuration(end - now)}`,
      state: "wait",
    });
  } else {
    tasks.push({
      key: "army",
      img: buildingImage(BUILDING_BY_ID["barracks"]),
      title: "Train troops",
      sub: armyHome ? `${compact(armyHome)} at home` : "Your tribe has no army yet",
      state: "todo",
      action: { label: "Train", href: "/battle?tab=army" },
    });
  }

  // 5b. Storage nearly full: sell the surplus on the Market
  const fullest = RESOURCES.map((r) => ({ r, share: state.resources[r.id] / rates.capacity })).sort(
    (a, b) => b.share - a.share
  )[0];

  if (fullest && fullest.share >= 0.9 && (state.buildings["trading-post"] ?? 0) >= 1) {
    tasks.push({
      key: "trade",
      img: buildingImage(BUILDING_BY_ID["trading-post"]),
      title: `Trade your extra ${fullest.r.name.toLowerCase()}`,
      sub: `Storage is ${Math.round(fullest.share * 100)}% full. Swap it on the Market`,
      state: "todo",
      action: { label: "Trade", href: "/market" },
    });
  }

  // 6. Barbarian camp
  const nextCamp = state.camps.cleared + 1;

  if (armyHome > 0 && campStatus(state, nextCamp, now).state === "new") {
    const r = campReward(state, nextCamp);

    tasks.push({
      key: "camp",
      img: buildingImage(BUILDING_BY_ID["military-command"]),
      title: `Raid barbarian camp ${nextCamp}`,
      sub: `First win: ${compact(r.resources)} each + ${compact(r.coins)} coins`,
      state: "todo",
      action: { label: "Raid", href: "/battle?tab=map" },
    });
  }

  // 7. Social tasks
  const openQuests = ACTIVE_QUESTS.filter((q) => questStatus(state, q.id, now).state !== "claimed");

  if (openQuests.length) {
    const coins = openQuests.reduce((s, q) => s + q.reward.coins, 0);

    tasks.push({
      key: "quests",
      img: QUEST_ICONS[openQuests[0].id],
      title: `${openQuests.length} saga task${openQuests.length > 1 ? "s" : ""} open`,
      sub: `${compact(coins)} coins and more people`,
      state: "todo",
      action: { label: "Open", href: "/quest" },
    });
  }

  // To-dos first, then in progress, then done.
  const order = { todo: 0, wait: 1, done: 2 };

  tasks.sort((a, b) => order[a.state] - order[b.state]);
  const doneCount = tasks.filter((t) => t.state === "done").length;
  const shielded = state.shieldUntil > now;
  const plusOn = plusActive(state);

  return (
    <div className="flex flex-col gap-3 px-3 pt-2 pb-4">
      {/* Your tribe */}
      <section className="card-hero p-3 pr-2 flex items-center gap-3 overflow-hidden">
        <span aria-hidden className="absolute -left-6 -top-6 w-36 h-36 rounded-full bg-gold/10 blur-2xl" />
        <Image
          alt=""
          className="relative w-[84px] h-[84px] object-contain shrink-0 drop-shadow-[0_6px_8px_rgba(0,0,0,0.6)]"
          height={168}
          priority
          src={buildingImage(BUILDING_BY_ID["town-hall"])}
          width={168}
        />
        <div className="relative flex-1 min-w-0 flex flex-col gap-1.5">
          <h1 className="title-screen truncate">{me.firstName || "Your tribe"}</h1>
          <div className="flex flex-wrap gap-1">
            <span className="pill">Hall {state.buildings["town-hall"] ?? 0}</span>
            <span className="pill"><GameIcon e="💪" /> {compact(powerScore(state))}</span>
            <span className="pill"><GameIcon e="👥" /> {compact(state.population)}</span>
          </div>
        </div>
        <Link
          aria-label={`Rank ${me.rank}, open the leaderboard`}
          className="relative shrink-0 w-[62px] h-[62px] rounded-full flex flex-col items-center justify-center border-2 border-gold bg-ink/70 shadow-[inset_0_0_12px_rgba(227,169,72,0.25)] active:scale-95 transition-transform"
          href="/leaderboard"
        >
          <span className="text-micro font-extrabold tracking-[0.14em] text-muted">RANK</span>
          <span className="font-display font-black text-lg leading-none text-goldtext">#{compact(me.rank)}</span>
        </Link>
      </section>

      {/* Protection and Plus at a glance */}
      <div className="grid grid-cols-2 gap-2">
        <button
          className={clsx(
            "card p-2.5 flex items-center gap-2 text-left active:scale-[0.98] transition-transform",
            !shielded && "!border-bad/60 bg-[linear-gradient(180deg,rgba(80,28,16,0.9),rgba(30,22,16,0.94))]"
          )}
          onClick={() => setShieldOpen(true)}
        >
          <span aria-hidden className="text-[28px] leading-none shrink-0"><GameIcon e="🛡️" /></span>
          <span className="flex flex-col min-w-0">
            <span className="font-display font-black text-[15px] leading-tight">Shield</span>
            <span className={clsx("flex items-center gap-1 text-caption font-bold truncate", shielded ? "text-good" : "text-bad")}>
              {shielded && <Image alt="" className="w-3.5 h-3.5 rounded-sm" src={timeImg} />}
              {shielded ? formatDuration(state.shieldUntil - now) : "Not protected"}
            </span>
          </span>
        </button>
        <button
          className={clsx("p-2.5 flex items-center gap-2 text-left active:scale-[0.98] transition-transform", plusOn ? "card" : "card-hero")}
          onClick={() => setPlusOpen(true)}
        >
          <span aria-hidden className="text-[28px] leading-none shrink-0"><GameIcon e="👑" /></span>
          <span className="flex flex-col min-w-0">
            <span className="font-display font-black text-[15px] leading-tight">Plus</span>
            <span className={clsx("text-caption font-bold truncate", plusOn ? "text-good" : "text-goldtext")}>
              {plusOn ? `${formatDuration(state.plus.until - now)} left` : state.plus.trialUsed ? "+1 builder & more" : "Try it free"}
            </span>
          </span>
        </button>
      </div>
      <PlusDrawer isOpen={plusOpen} onClose={() => setPlusOpen(false)} />
      <ShieldDrawer isOpen={shieldOpen} onClose={() => setShieldOpen(false)} onOpenPlus={() => setPlusOpen(true)} />

      {/* Today */}
      <section className="card px-3 pt-3 pb-1">
        <SectionTitle right={`${doneCount} of ${tasks.length} done`}>Today</SectionTitle>
        <Bar className="mt-2.5 h-1.5" max={tasks.length} value={doneCount} />
        <ul className="divide-y divide-line/50 mt-1">
          {tasks.map((t) => (
            <TaskRow key={t.key} t={t} />
          ))}
        </ul>
      </section>

      {/* Production at a glance */}
      <section className="card p-3 flex flex-col gap-2.5">
        <SectionTitle
          right={
            <span className="flex items-center gap-1 text-goldtext font-extrabold">
              <Image alt="" className="w-4 h-4" src={coinImg} />+{compact(rates.coinsPerHour)}/h
            </span>
          }
        >
          Production
        </SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {RESOURCES.map((r) => {
            const have = state.resources[r.id];
            const perHour = rates.productionPerHour[r.id];
            const full = have >= rates.capacity;
            const hoursToFull = perHour > 0 && !full ? (rates.capacity - have) / perHour : null;

            return (
              <div key={r.id} className="inset p-2 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Image alt={r.name} className="w-6 h-6 shrink-0 object-contain" src={r.img} />
                  <span className={clsx("font-extrabold text-sm tabular-nums", full && "text-bad")}>{compact(have)}</span>
                  <span className="text-micro font-bold text-muted">/ {compact(rates.capacity)}</span>
                </div>
                <div className="bar h-1.5">
                  <span
                    className={clsx("bar-fill", full && "!bg-none bg-bad")}
                    style={{ width: `${Math.min(100, (have / rates.capacity) * 100)}%` }}
                  />
                </div>
                <span className={clsx("text-micro font-extrabold", perHour < 0 ? "text-bad" : "text-good")}>
                  {perHour >= 0 ? "+" : ""}
                  {compact(perHour)}/h
                  <span className="text-muted font-bold">
                    {full ? " · full" : hoursToFull !== null && hoursToFull < 24 ? ` · full in ${formatDuration(hoursToFull * 3600e3)}` : ""}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
