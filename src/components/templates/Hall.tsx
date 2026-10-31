"use client";
import { useEffect, useMemo, useState } from "react";
import Image, { StaticImageData } from "next/image";
import Link from "next/link";
import clsx from "clsx";

import coinImg from "~/images/resources/coin.webp";
import hallBg from "~/images/background/tribe.webp";

import { ACTIVE_QUESTS, QUEST_ICONS } from "@/components/organisms/quest/QuestDrawer";
import { RESOURCES, useGame, useTelegramContext } from "@/context";
import { apiRequest } from "@/lib/api";
import { compact, formatDuration } from "@/lib/format";
import { BUILDING_BY_ID, STAMINA_PER_TAP, STREAK_REWARDS, UNIT_BY_ID, buildingImage, unitPlural } from "@/lib/game/config";
import { questStatus, streakStatus, trainingEndsAt } from "@/lib/game/engine";
import { campReward, campStatus, defensePower, powerScore } from "@/lib/game/war";
import { recommendUpgrade, upgradeOptions } from "@/lib/game/advice";
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

/** A task's button: a link, or an action done right here. */
const TaskAction = ({ t }: { t: Task }) => {
  if (!t.action || t.state === "done") return null;
  const look = clsx("btn btn-sm shrink-0", t.tone === "danger" ? "btn-ember" : t.tone === "gold" ? "btn-gold" : "btn-wood text-goldtext");

  return t.action.href ? (
    <Link className={look} href={t.action.href as any}>
      {t.action.label}
    </Link>
  ) : (
    <button className={look} disabled={t.action.busy} onClick={t.action.onClick}>
      {t.action.label}
    </button>
  );
};

/** Something that needs you now: an attack coming, hungry troops, a raid to answer. */
const AlertCard = ({ t }: { t: Task }) => (
  <div
    className={clsx(
      "rounded-xl border p-2.5 flex items-center gap-3",
      t.tone === "danger"
        ? "border-bad/70 bg-[linear-gradient(180deg,rgba(84,30,18,0.95),rgba(40,20,14,0.95))] shadow-[0_0_14px_rgba(200,70,50,0.25)]"
        : "border-gold/60 bg-[linear-gradient(180deg,rgba(70,52,24,0.95),rgba(34,26,16,0.95))]"
    )}
    role={t.tone === "danger" ? "alert" : undefined}
  >
    <Image alt="" className="w-10 h-10 object-contain shrink-0" height={80} src={t.img} width={80} />
    <span className="flex-1 min-w-0 flex flex-col">
      <span className="font-bold leading-tight">{t.title}</span>
      {t.sub && <span className={clsx("text-xs font-bold", t.tone === "danger" ? "text-[#FFB27A]" : "text-sub")}>{t.sub}</span>}
    </span>
    <TaskAction t={t} />
  </div>
);

/** One thing to do: its picture, what it is, and the button that does it. */
const TaskRow = ({ t }: { t: Task }) => {
  const done = t.state === "done";

  return (
    <li className={clsx("flex items-center gap-3 py-2.5", done && "opacity-55")}>
      <span className="relative shrink-0">
        <Image alt="" className="w-10 h-10 object-contain rounded-lg" height={80} src={t.img} width={80} />
        {done && (
          <span className="absolute -right-1 -bottom-1 w-[18px] h-[18px] rounded-full bg-good text-[#1A120B] flex items-center justify-center border-2 border-panel">
            <svg aria-hidden="true" fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" viewBox="0 0 24 24" width="10">
              <path d="m5 12.5 4.5 4.5L19 7" />
            </svg>
          </span>
        )}
      </span>
      <span className="flex-1 min-w-0 flex flex-col">
        <span className={clsx("font-bold leading-tight", done && "line-through decoration-muted")}>{t.title}</span>
        {t.sub && <span className="text-xs font-bold text-muted">{t.sub}</span>}
      </span>
      <TaskAction t={t} />
    </li>
  );
};

/** Work under way: a picture, what it is, how far along, and the time left. */
const WorkRow = ({ img, title, from, to, now }: { img: string; title: string; from: number; to: number; now: number }) => (
  <li className="flex items-center gap-2.5">
    <Image alt="" className="w-8 h-8 object-contain shrink-0" height={64} src={img} width={64} />
    <span className="flex-1 min-w-0 flex flex-col gap-1">
      <span className="flex items-baseline gap-2">
        <span className="flex-1 min-w-0 truncate text-sm font-bold">{title}</span>
        <span className="shrink-0 text-xs font-extrabold text-goldtext tabular-nums">{formatDuration(to - now)}</span>
      </span>
      <Bar className="h-1.5" max={Math.max(1, to - from)} value={Math.max(0, Math.min(to - from, now - from))} />
    </span>
  </li>
);

/** Where to go from here: the places a chief visits most. */
const PLACES = [
  { href: "/resources", label: "Mine", img: "/images/resources/rock-iron.webp" },
  { href: "/battle?tab=army", label: "Army", img: "/images/buildings/Barracks.webp" },
  { href: "/battle?tab=map", label: "Map", img: "/images/icons/compass.webp" },
  { href: "/market", label: "Market", img: "/images/buildings/Trading%20Post.webp" },
] as const;

export const Hall = () => {
  const { telegram } = useTelegramContext();
  const { state, rates, now, me, authHeader, claimStreak, upgradeBuilding } = useGame();
  const [news, setNews] = useState<ReportItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [shieldOpen, setShieldOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  // The bandit raid report you've already read (by its time), so it stops showing.
  const [seenBandits, setSeenBandits] = useState<number | null>(() => {
    try {
      return Number(localStorage.getItem("bandits-seen")) || null;
    } catch {
      return null;
    }
  });
  const seeBandits = (at: number) => {
    setSeenBandits(at);
    try {
      localStorage.setItem("bandits-seen", String(at));
    } catch {
      /* storage blocked: it shows again next time */
    }
  };

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
  // What needs you now (shown at the top, only when there's something), and the day's to-dos.
  const alerts: Task[] = [];
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

    alerts.push({
      key: "revenge",
      img: buildingImage(BUILDING_BY_ID["war-hall"]),
      title: `Take revenge on ${news.opponent}`,
      sub: `They raided you ${formatDuration(now - news.at)} ago and took ${compact(lost)}`,
      state: "todo",
      tone: "danger",
      action: { label: "Revenge", href: `/battle?revenge=${news.opponentId}` },
    });
  }

  // 3. Bandits: gathering to raid you, or how their last raid went.
  const raid = state.banditRaid;
  const bandits = state.banditReport;

  if (raid && raid.arrivesAt > now) {
    const defense = Math.round(defensePower(state));

    alerts.unshift({
      key: "bandits",
      img: "/images/icons/skull.webp",
      title: `Bandits strike in ${formatDuration(raid.arrivesAt - now)}`,
      sub: `About ${compact(raid.strength)} strong vs your defense ${compact(defense)}. Train defenders, or clear their lair first.`,
      state: "todo",
      tone: "danger",
      action: { label: "Map", href: "/battle?tab=map" },
    });
  } else if (bandits && now - bandits.at < 24 * 3600e3 && seenBandits !== bandits.at) {
    const taken = Object.values(bandits.stolen).reduce((a, b) => a + b, 0);

    alerts.push({
      key: "bandits",
      img: "/images/icons/skull.webp",
      title:
        bandits.outcome === "won"
          ? "You beat off the bandits!"
          : bandits.outcome === "lost"
            ? "Bandits raided your village"
            : "The bandit raid is off",
      sub:
        bandits.outcome === "won"
          ? `Their lair is cleared: +${compact(bandits.bounty?.resources ?? 0)} of each resource, +${compact(bandits.bounty?.coins ?? 0)} coins`
          : bandits.outcome === "lost"
            ? `They carried off ${compact(taken)} resources. Build up your defense before they come back.`
            : "Their lair was cleared before they could strike.",
      state: "todo",
      tone: bandits.outcome === "lost" ? "danger" : "gold",
      action: { label: "OK", onClick: () => seeBandits(bandits.at) },
    });
  }

  // Hungry troops: the crop is running out (or gone) while more is eaten than grown.
  const cropRate = rates.productionPerHour.crop;

  if (cropRate < 0) {
    const left = state.resources.crop / -cropRate;

    if (left < 12)
      alerts.push({
        key: "crop",
        img: RESOURCES.find((r) => r.id === "crop")!.img,
        title: state.resources.crop <= 0 ? "Your troops are starving" : `Crop runs out in ${formatDuration(left * 3600e3)}`,
        sub:
          state.resources.crop <= 0
            ? "Some desert every hour. Build Windmills or a Fertilizer Workshop."
            : `You eat ${compact(-cropRate)} more than you grow each hour. Then troops start to desert.`,
        state: "todo",
        tone: "danger",
        action: { label: "Build", href: "/tribe" },
      });
  }

  // 4. Build
  const advice = recommendUpgrade(state, options);
  const freeBuilders = rates.builders - state.queue.length;

  if (advice) {
    const o = options.find((x) => x.building.id === advice.id)!;

    tasks.push({
      key: "build",
      img: buildingImage(o.building),
      title: `${o.level === 0 ? "Build" : "Upgrade"} ${o.building.name} to ${o.toLevel}`,
      sub: `${advice.reason}, ${compact(o.cost)} of each`,
      state: "todo",
      tone: "gold",
      action: { label: o.level === 0 ? "Build" : "Upgrade", onClick: () => run("build", () => upgradeBuilding(o.building.id)), busy: busy === "build" },
    });
  } else if (freeBuilders > 0) {
    const soonest = options
      .filter((o) => !o.job && o.hoursToAfford !== null)
      .sort((a, b) => (a.hoursToAfford ?? 0) - (b.hoursToAfford ?? 0))[0];

    if (soonest) {
      tasks.push({
        key: "build",
        img: buildingImage(soonest.building),
        title: `Save up for ${soonest.building.name} ${soonest.toLevel}`,
        sub: `Affordable in about ${formatDuration((soonest.hoursToAfford ?? 0) * 3600e3)}, sooner if you mine`,
        state: "wait",
        action: { label: "View", href: "/tribe" },
      });
    }
  }

  // 5. Daily Mine
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

  // 6. Army
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
  } else if (!state.training.length) {
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
      sub: `Storage is ${Math.round(fullest.share * 100)}% full. Swap it on the Market.`,
      state: "todo",
      action: { label: "Trade", href: "/market" },
    });
  }

  // 7. Barbarian camp
  const nextCamp = state.camps.cleared + 1;

  if (armyHome > 0 && campStatus(state, nextCamp, now).state === "new") {
    const r = campReward(state, nextCamp);

    tasks.push({
      key: "camp",
      img: buildingImage(BUILDING_BY_ID["military-command"]),
      title: `Raid barbarian camp ${nextCamp}`,
      sub: `First win: ${compact(r.resources)} each + ${compact(r.coins)} coins`,
      state: "todo",
      action: { label: "Raid", href: `/battle?camp=${nextCamp}` },
    });
  }

  // 8. Social tasks
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

  // To-dos first, then in progress, then done. The first three are the next steps; the rest fold away.
  const order = { todo: 0, wait: 1, done: 2 };

  tasks.sort((a, b) => order[a.state] - order[b.state]);
  const doneCount = tasks.filter((t) => t.state === "done").length;
  const next = tasks.slice(0, 3);
  const later = tasks.slice(3);
  const shielded = state.shieldUntil > now;
  const plusOn = plusActive(state);
  const working = state.queue.length + state.training.length;

  return (
    <div className="flex flex-col gap-3 px-3 pt-2 pb-4">
      {/* Your tribe, in its village: the one picture on the page. */}
      <section className="relative overflow-hidden rounded-2xl border border-frame/80 shadow-card min-h-[188px] flex flex-col justify-end">
        <Image
          fill
          priority
          alt=""
          className="object-cover object-[50%_42%]"
          placeholder="blur"
          sizes="(max-width: 448px) 100vw, 448px"
          src={hallBg}
        />
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-ground via-ground/70 to-ground/10" />
        <Link
          aria-label={`Rank ${me.rank}, open the leaderboard`}
          className="absolute right-2.5 top-2.5 w-[58px] h-[58px] rounded-full flex flex-col items-center justify-center border-2 border-gold bg-ink/80 shadow-[inset_0_0_12px_rgba(227,169,72,0.25)] active:scale-95 transition-transform"
          href="/leaderboard"
        >
          <span className="text-micro font-extrabold text-muted">Rank</span>
          <span className="font-display font-black text-lg leading-none text-goldtext">#{compact(me.rank)}</span>
        </Link>
        <div className="relative flex items-end gap-2.5 px-3 pt-10 pb-3">
          <Image
            alt=""
            className="w-[92px] h-[92px] -mb-1 -ml-1 object-contain shrink-0 drop-shadow-[0_6px_8px_rgba(0,0,0,0.7)]"
            height={184}
            priority
            src={buildingImage(BUILDING_BY_ID["town-hall"])}
            width={184}
          />
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <h1 className="title-screen truncate drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]">{me.firstName || "Your tribe"}</h1>
            <div className="flex flex-wrap gap-1">
              <span className="pill">Hall {state.buildings["town-hall"] ?? 0}</span>
              <span className="pill"><GameIcon e="💪" /> {compact(powerScore(state))}</span>
              <span className="pill"><GameIcon e="👥" /> {compact(state.population)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                className={clsx(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-extrabold active:scale-95 transition-transform",
                  shielded ? "border-good/60 bg-ink/80 text-good" : "border-bad/70 bg-[rgba(84,30,18,0.9)] text-bad"
                )}
                onClick={() => setShieldOpen(true)}
              >
                <GameIcon e="🛡️" /> {shielded ? formatDuration(state.shieldUntil - now) : "Unprotected"}
              </button>
              <button
                className={clsx(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-extrabold active:scale-95 transition-transform",
                  plusOn ? "border-good/60 bg-ink/80 text-good" : "border-gold/70 bg-ink/80 text-goldtext"
                )}
                onClick={() => setPlusOpen(true)}
              >
                <GameIcon e="👑" /> {plusOn ? `Plus, ${formatDuration(state.plus.until - now)} left` : state.plus.trialUsed ? "Get Plus" : "Try Plus free"}
              </button>
            </div>
          </div>
        </div>
      </section>
      <PlusDrawer isOpen={plusOpen} onClose={() => setPlusOpen(false)} />
      <ShieldDrawer isOpen={shieldOpen} onClose={() => setShieldOpen(false)} onOpenPlus={() => setPlusOpen(true)} />

      {/* What needs you now: only when something does. */}
      {alerts.length > 0 && (
        <section aria-label="Needs you now" className="flex flex-col gap-2">
          {alerts.map((t) => (
            <AlertCard key={t.key} t={t} />
          ))}
        </section>
      )}

      {/* Next steps: the three most useful things to do, the rest folded away. */}
      <section className="card px-3 pt-3 pb-1">
        <SectionTitle right={`${doneCount} of ${tasks.length} done today`}>Next steps</SectionTitle>
        <ul className="divide-y divide-line/50 mt-1">
          {next.map((t) => (
            <TaskRow key={t.key} t={t} />
          ))}
        </ul>
        {later.length > 0 && (
          <>
            {showMore && (
              <ul className="divide-y divide-line/50 border-t border-line/50">
                {later.map((t) => (
                  <TaskRow key={t.key} t={t} />
                ))}
              </ul>
            )}
            <button
              aria-expanded={showMore}
              className="w-full border-t border-line/50 py-2 text-sm font-extrabold text-goldtext"
              onClick={() => setShowMore((v) => !v)}
            >
              {showMore ? "Show less" : `${later.length} more`}
            </button>
          </>
        )}
      </section>

      {/* Work under way: builders and training, with the time left. */}
      {working > 0 && (
        <section className="card p-3 flex flex-col gap-2.5">
          <SectionTitle right={`${state.queue.length} of ${rates.builders} builders busy`}>Under way</SectionTitle>
          <ul className="flex flex-col gap-2.5">
            {[...state.queue]
              .sort((a, b) => a.endsAt - b.endsAt)
              .map((q) => (
                <WorkRow
                  key={`b-${q.building}`}
                  from={q.startedAt}
                  img={buildingImage(BUILDING_BY_ID[q.building])}
                  now={now}
                  title={`${BUILDING_BY_ID[q.building].name} to level ${q.toLevel}`}
                  to={q.endsAt}
                />
              ))}
            {state.training.map((t, i) => (
              <WorkRow
                key={`t-${i}`}
                from={t.startsAt}
                img={`/images/troops/${t.unit}.webp`}
                now={now}
                title={`${t.count - t.done} ${t.count - t.done === 1 ? UNIT_BY_ID[t.unit].name : unitPlural(t.unit)}`}
                to={trainingEndsAt(t)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Stores: how full, and how fast they fill. */}
      <section className="card p-3 flex flex-col gap-2.5">
        <SectionTitle
          right={
            <span className="flex items-center gap-1 text-goldtext font-extrabold">
              <Image alt="" className="w-4 h-4" src={coinImg} />+{compact(rates.coinsPerHour)}/h
            </span>
          }
        >
          Stores
        </SectionTitle>
        <div className="grid grid-cols-4 gap-1.5">
          {RESOURCES.map((r) => {
            const have = state.resources[r.id];
            const perHour = rates.productionPerHour[r.id];
            const full = have >= rates.capacity;

            return (
              <div key={r.id} className="inset px-1.5 py-2 flex flex-col items-center gap-1">
                <Image alt={r.name} className="w-6 h-6 object-contain" src={r.img} />
                <span className={clsx("font-extrabold text-sm tabular-nums leading-none", full && "text-bad")}>{compact(have)}</span>
                <div className="bar h-1 w-full">
                  <span className={clsx("bar-fill", full && "!bg-none bg-bad")} style={{ width: `${Math.min(100, (have / rates.capacity) * 100)}%` }} />
                </div>
                <span className={clsx("text-micro font-extrabold tabular-nums", perHour < 0 ? "text-bad" : "text-good")}>
                  {perHour >= 0 ? "+" : ""}
                  {compact(perHour)}/h
                </span>
              </div>
            );
          })}
        </div>
        <span className="text-micro font-bold text-muted text-center">Each store holds up to {compact(rates.capacity)}</span>
      </section>

      {/* Where to go from here */}
      <nav aria-label="Places" className="grid grid-cols-4 gap-2">
        {PLACES.map((p) => (
          <Link
            key={p.href}
            className="card py-2 flex flex-col items-center gap-1 active:scale-95 transition-transform"
            href={p.href as any}
          >
            <Image alt="" className="w-9 h-9 object-contain" height={72} src={p.img} width={72} />
            <span className="text-xs font-extrabold">{p.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
};
