"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";

import { Amount, Avatar, Backdrop, Card, Segmented, Spinner } from "@/components/ui";
import { GameIconId } from "@/art";
import { useGame } from "@/context";
import { apiRequest } from "@/lib/api";
import useBackButton from "@/hooks/useBackButton";

type Metric = "population" | "power" | "wins";
type Row = { rank: number; id: number; name: string; photoUrl: string | null; value: number; isMe: boolean };
type Data = { metric: Metric; me: { rank: number; value: number }; top: Row[] };

const ICON: Record<Metric, GameIconId> = { population: "population", power: "attack", wins: "trophy" };
const PODIUM = ["from-gold-300 to-gold-500 text-ink-950", "from-[#E4E7EA] to-[#9FA7AF] text-ink-950", "from-[#E2A06B] to-[#A9643A] text-ink-950"];

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
      <div className="w-full flex flex-col gap-2.5 px-3 pt-1 pb-4">
        <h1 className="font-display font-extrabold text-display-lg text-center">Hall of Legends</h1>
        <Segmented
          options={[
            { id: "population", label: "Population" },
            { id: "power", label: "Power" },
            { id: "wins", label: "Victories" },
          ]}
          value={metric}
          onChange={setMetric}
        />
        {data && (
          <Card className="flex items-center justify-between" tone="gold">
            <span className="font-display font-bold text-title">Your rank #{data.me.rank.toLocaleString("en-US")}</span>
            <Amount icon={ICON[metric]} raw size="md" value={data.me.value} />
          </Card>
        )}
        {error && <p className="text-small text-blood-400">{error}</p>}
        {!data && !error && <Spinner />}
        <div className="flex flex-col gap-1.5">
          {data?.top.map((r) => (
            <div
              key={r.id}
              className={clsx(
                "flex items-center gap-2.5 rounded-2xl px-2.5 py-2 bg-ink-800/90 border",
                r.isMe ? "border-gold-500 shadow-glow" : "border-ink-500/70"
              )}
            >
              <span
                className={clsx(
                  "w-8 h-8 rounded-xl flex items-center justify-center font-display font-extrabold text-[15px] shrink-0",
                  r.rank <= 3 ? `bg-gradient-to-b ${PODIUM[r.rank - 1]}` : "bg-ink-700 text-parch-300"
                )}
              >
                {r.rank}
              </span>
              <Avatar seed={r.id} size={34} src={r.photoUrl} />
              <span className="flex-1 truncate font-bold">
                {r.name}
                {r.isMe && <span className="text-gold-300"> (you)</span>}
              </span>
              <Amount icon={ICON[metric]} raw value={r.value} />
            </div>
          ))}
        </div>
      </div>
      <Backdrop scene="night" />
    </>
  );
};
