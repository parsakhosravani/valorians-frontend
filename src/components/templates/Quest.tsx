"use client";
import React, { FunctionComponent, useState } from "react";
import bg from "~/images/background/friends.webp";
import population from "~/images/resources/population.webp";
import viking from "~/images/quest/viking.png";
import Image from "next/image";
import clsx from "clsx";
import { ACTIVE_QUESTS, QUEST_ICONS, QuestDrawer } from "@/components/organisms/quest/QuestDrawer";
import { Coin } from "@/components/molecules/Coin";
import { EmptyState, SectionTitle } from "@/components/atoms/Ui";
import { useGame } from "@/context";
import { QuestId } from "@/lib/game/config";
import { questStatus } from "@/lib/game/engine";

type QuestPropsType = Record<string, never>;

export const Quest: FunctionComponent<QuestPropsType> = () => {
  const { state, now } = useGame();
  const [openDrawer, setOpenDrawer] = useState<QuestId | null>(null);

  return (
    <>
      <div className="relative flex flex-col gap-3 w-full px-3 pt-8 pb-4">
        {/* The saga keeper */}
        <div className="card-hero min-h-[104px] w-full flex justify-end">
          <div className="w-[38%] relative">
            <Image
              alt=""
              className="absolute max-w-[150px] w-[125%] h-[140%] bottom-0 -left-1 object-left-bottom object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)]"
              src={viking}
            />
          </div>
          <div className="w-[62%] flex flex-col justify-center gap-1 pr-3 py-3">
            <h1 className="title-screen">Sagas</h1>
            <p className="text-sub text-[13px] leading-snug">
              Finish tasks to earn coins and people that grow your tribe faster.
            </p>
          </div>
        </div>

        <SectionTitle right={`${ACTIVE_QUESTS.filter((q) => questStatus(state, q.id, now).state === "claimed").length} of ${ACTIVE_QUESTS.length} done`}>
          Tasks
        </SectionTitle>
        <div className="grid gap-2 w-full">
          {ACTIVE_QUESTS.length === 0 && (
            <EmptyState e="📦" title="No tasks right now">
              New sagas arrive often. Check back soon!
            </EmptyState>
          )}
          {ACTIVE_QUESTS.map((item) => {
            const done = questStatus(state, item.id, now).state === "claimed";

            return (
              <button
                key={item.id}
                className={clsx("card w-full flex gap-3 items-center p-2.5 text-left active:scale-[0.99] transition-transform", done && "opacity-60")}
                onClick={() => setOpenDrawer(item.id)}
              >
                <Image alt="" className="w-10 h-10 rounded-lg shrink-0" height={40} src={QUEST_ICONS[item.id]} width={40} />
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <div className="leading-tight font-bold truncate">{item.title}</div>
                  <div className="flex flex-wrap gap-1">
                    <span className="pill pill-gold h-5"><Coin amount={item.reward.coins} /></span>
                    <span className="pill h-5">
                      <Image alt="" className="w-3.5 h-3.5 rounded-sm" src={population} />+{item.reward.population}
                    </span>
                    <span className="pill pill-good h-5">
                      <Image alt="" className="w-3.5 h-3.5 rounded-sm" src={population} />+{item.reward.growth}/h
                    </span>
                  </div>
                </div>
                <span className={clsx("shrink-0 font-display font-black text-lg pr-1", done ? "text-good" : "text-goldtext")}>{done ? "✓" : "›"}</span>
              </button>
            );
          })}
        </div>
      </div>
      <QuestDrawer openDrawer={openDrawer} setOpenDrawer={setOpenDrawer} />

      <Image
        priority
        src={bg}
        alt={"intro"}
        className="fixed h-full top-0 left-0 w-full -z-10 object-cover opacity-30"
      />
    </>
  );
};
