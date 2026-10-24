"use client";
import React, { FunctionComponent, useState } from "react";
import Image from "next/image";

import { ACTIVE_QUESTS, QUEST_ICONS, QuestDrawer, QuestRewards } from "@/components/organisms/quest/QuestDrawer";
import { Backdrop, Badge, Card, Empty, Icon, SectionTitle } from "@/components/ui";
import { TroopArt } from "@/art";
import { useGame } from "@/context";
import { QuestId } from "@/lib/game/config";
import { questStatus } from "@/lib/game/engine";

export const Quest: FunctionComponent = () => {
  const { state, now } = useGame();
  const [openDrawer, setOpenDrawer] = useState<QuestId | null>(null);

  return (
    <>
      <div className="relative flex flex-col gap-4 w-full px-3 pt-2 pb-4">
        <Card className="relative overflow-hidden flex gap-2 pl-0 pb-0 min-h-[124px]" tone="gold">
          <div className="relative w-[112px] shrink-0">
            <TroopArt className="absolute -bottom-1 left-0 w-[118px] h-[118px]" id="archer" />
          </div>
          <div className="flex flex-col gap-1.5 py-1 pb-3">
            <h1 className="font-display font-extrabold text-display-lg leading-none">Sagas</h1>
            <p className="text-small text-parch-300">Finish tasks to earn coins and people, and grow your tribe faster.</p>
          </div>
        </Card>

        <div className="flex flex-col gap-2">
          <SectionTitle>Tasks</SectionTitle>
          {ACTIVE_QUESTS.length === 0 && <Empty title="No tasks right now">Check back soon.</Empty>}
          {ACTIVE_QUESTS.map((item) => {
            const done = questStatus(state, item.id, now).state === "claimed";

            return (
              <Card key={item.id} className="flex gap-3 items-center" onClick={() => setOpenDrawer(item.id)}>
                <Image alt="" className="w-11 h-11 rounded-xl shrink-0" src={QUEST_ICONS[item.id]} />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div className="font-bold leading-tight">{item.title}</div>
                  <QuestRewards quest={item} />
                </div>
                {done ? <Badge tone="moss">Done</Badge> : <Icon className="text-parch-500" name="chevron" />}
              </Card>
            );
          })}
        </div>
      </div>
      <QuestDrawer openDrawer={openDrawer} setOpenDrawer={setOpenDrawer} />
      <Backdrop scene="road" />
    </>
  );
};
