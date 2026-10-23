"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import bg from "~/images/background/tribe.webp";
import avatar from "~/images/avatar.webp";

import { Tabs } from "@/components/organisms/war/shared";
import { useGame } from "@/context";
import { apiRequest } from "@/lib/api";
import useBackButton from "@/hooks/useBackButton";

type Metric = "population" | "power" | "wins";
type Row = { rank: number; id: number; name: string; photoUrl: string | null; value: number; isMe: boolean };
type Data = { metric: Metric; me: { rank: number; value: number }; top: Row[] };

const LABEL: Record<Metric, string> = { population: "👥", power: "💪", wins: "🏆" };
const MEDAL = ["🥇", "🥈", "🥉"];

export const Leaderboard = () => {
  useBackButton();
  const { authHeader } = useGame();
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
      <div className="w-full flex flex-col gap-2 px-2 self-start">
        <h1 className="text-2xl font-black text-center">Leaderboard</h1>
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
          <div className="bg-[#019AF0] rounded-md px-3 py-2 flex justify-between font-bold">
            <span>Your rank: #{data.me.rank.toLocaleString("en-US")}</span>
            <span>
              {LABEL[metric]} {data.me.value.toLocaleString("en-US")}
            </span>
          </div>
        )}
        {error && <p className="text-sm text-[#F72214]">{error}</p>}
        {!data && !error && <p className="text-sm text-[#B5C7DE]">Loading…</p>}
        <div className="flex flex-col gap-1.5 overflow-y-auto scrollable max-h-[58svh] pb-28">
          {data?.top.map((r) => (
            <div
              key={r.id}
              className={clsx(
                "flex items-center gap-2 rounded-md px-2 py-1.5 bg-buildingBg backdrop-blur-xs",
                r.isMe && "border border-[#019AF0]"
              )}
            >
              <span className="w-8 text-center font-bold">{MEDAL[r.rank - 1] ?? r.rank}</span>
              {r.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" className="h-8 w-8 rounded object-cover" src={r.photoUrl} />
              ) : (
                <Image alt="" className="h-8 w-8 rounded" src={avatar} />
              )}
              <span className="flex-1 truncate font-bold">
                {r.name}
                {r.isMe && " (you)"}
              </span>
              <span className="font-bold">
                {LABEL[metric]} {r.value.toLocaleString("en-US")}
              </span>
            </div>
          ))}
        </div>
      </div>
      <Image priority alt="" className="absolute h-full top-0 left-0 w-full -z-10 object-cover opacity-40" src={bg} />
    </>
  );
};
