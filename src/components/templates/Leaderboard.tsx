"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import bg from "~/images/background/tribe.webp";

import { Tabs } from "@/components/organisms/war/shared";
import { Avatar } from "@/components/molecules/Avatar";
import { useGameStatus } from "@/context";
import { apiRequest } from "@/lib/api";
import useBackButton from "@/hooks/useBackButton";
import { ScreenHeader } from "@/components/atoms/Ui";
import { GameIcon } from "@/components/atoms/GameIcon";

type Metric = "population" | "power" | "wins";
type Row = { rank: number; id: number; name: string; photoUrl: string | null; value: number; isMe: boolean; plus?: boolean };
type Data = { metric: Metric; me: { rank: number; value: number }; top: Row[] };

const LABEL: Record<Metric, string> = { population: "👥", power: "💪", wins: "🏆" };
const MEDAL = ["🥇", "🥈", "🥉"];

export const Leaderboard = () => {
  useBackButton();
  const { authHeader } = useGameStatus();
  const [metric, setMetric] = useState<Metric>("population");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authHeader) return;
    setData(null);
    apiRequest<Data>(authHeader, `leaderboard?by=${metric}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [authHeader, metric]);

  return (
    <>
      <div className="w-full flex flex-col gap-2 px-3 pt-1">
        <ScreenHeader className="pt-1" subtitle="The mightiest tribes of the north" title="Leaderboard" />
        <Tabs
          tabs={[
            { id: "population", label: "Population" },
            { id: "power", label: "Power" },
            { id: "wins", label: "Victories" },
          ]}
          value={metric}
          onChange={setMetric}
        />
        {data && (
          <div className="card-hero px-3 py-2.5 flex items-center gap-3">
            <span className="label !text-goldtext">Your rank</span>
            <span className="title-screen !text-[22px] flex-1">#{data.me.rank.toLocaleString("en-US")}</span>
            <span className="pill pill-gold h-7 text-sm">
              <GameIcon e={LABEL[metric]} /> {data.me.value.toLocaleString("en-US")}
            </span>
          </div>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}
        {!data && !error && <p className="text-sm text-muted text-center py-6">Loading…</p>}
        <div className="flex flex-col gap-1.5 pb-4">
          {data?.top.map((r) => (
            <div
              key={r.id}
              className={clsx(
                "flex items-center gap-2.5 px-2.5 py-2",
                r.rank <= 3 ? "card" : "card-flat",
                r.rank === 1 && "!border-gold/80",
                r.rank === 2 && "!border-[#C9C9C9]/60",
                r.rank === 3 && "!border-[#C47A45]/70",
                r.isMe && "!border-gold shadow-glow"
              )}
            >
              <span className="w-8 text-center font-display font-black text-muted">{MEDAL[r.rank - 1] ? <GameIcon className="w-7 h-7" e={MEDAL[r.rank - 1]} /> : r.rank}</span>
              <Avatar className="rounded-lg border border-line" size={34} src={r.photoUrl} />
              <span className="flex-1 truncate font-bold">
                {r.name}
                {r.plus && <span aria-label="Plus" className="ml-1" title="Valorians Plus"><GameIcon e="👑" /></span>}
                {r.isMe && " (you)"}
              </span>
              <span className="stat text-sm text-parch">
                <GameIcon e={LABEL[metric]} /> {r.value.toLocaleString("en-US")}
              </span>
            </div>
          ))}
        </div>
      </div>
      <Image priority alt="" className="fixed h-full top-0 left-0 w-full -z-10 object-cover opacity-30" src={bg} />
    </>
  );
};
