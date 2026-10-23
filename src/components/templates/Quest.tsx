"use client";
import React, { FunctionComponent, useState } from "react";
import bg from "~/images/background/friends.webp";
import population from "~/images/resources/population.webp";
import viking from "~/images/quest/viking.png";
import Image from "next/image";
import { ACTIVE_QUESTS, Coin, QUEST_ICONS, QuestDrawer, TextImage } from "@/components";
import { useGame } from "@/context";
import { QuestId } from "@/lib/game/config";
import { questStatus } from "@/lib/game/engine";

interface QuestPropsType {}

export const Quest: FunctionComponent<QuestPropsType> = () => {
  const { state, now } = useGame();
  const [openDrawer, setOpenDrawer] = useState<QuestId | null>(null);

  return (
    <>
      <div className="relative flex flex-col w-full px-3 pt-8 pb-4">
        <div className="bg-buildingBg border border-line min-h-[100px] w-full flex justify-end rounded-2xl">
          <div className="w-2/6 flex flex-col justify-start relative">
            <Image
              src={viking}
              alt="avatar"
              className="absolute max-w-[130px] max-h-[130px] w-[120%] h-[120%] bottom-0 object-left-bottom object-contain"
            />
          </div>
          <div className="w-4/6 flex flex-col justify-between pl-3 py-2.5">
            <div className="text-left font-display text-parch text-lg font-bold">
              Sagas
            </div>
            <div className="text-[#D8C9AE] text-xs font-normal">
              By completing tasks, you earn rewards that help you develop your
              tribe faster. Use these rewards to enhance your tribe's growth and
              strength!
            </div>
          </div>
        </div>

        <div className="flex flex-col w-full items-start mt-4">
          <div className="font-display text-parch text-lg font-bold">
            Tasks
          </div>
          <div className="grid gap-2.5 w-full pb-4">
            {ACTIVE_QUESTS.length === 0 && (
              <p className="text-sm text-[#B19C80]">No tasks right now. Check back soon!</p>
            )}
            {ACTIVE_QUESTS.map((item) => {
              const done = questStatus(state, item.id, now).state === "claimed";

              return (
                <button
                  key={item.id}
                  className="w-full h-12 flex gap-2 items-center px-[6px] py-[5px] bg-buildingBg border border-line rounded-xl text-left"
                  onClick={() => setOpenDrawer(item.id)}
                >
                  <Image alt="social" height={34} src={QUEST_ICONS[item.id]} width={34} />
                  <div className="flex flex-col justify-start gap-[5px] flex-1">
                    <div className="leading-none font-bold">{item.title}</div>
                    <div className="flex gap-3">
                      <Coin amount={item.reward.coins} />
                      <TextImage
                        direction="row"
                        imgAlt="population"
                        imgSrc={population}
                        size="small"
                        title={`+${item.reward.population}`}
                      />
                      <TextImage
                        direction="row"
                        imgAlt="populationPerHour"
                        imgSrc={population}
                        size="small"
                        title={`+${item.reward.growth}/h`}
                      />
                    </div>
                  </div>
                  <span className="text-lg pr-1">{done ? "✅" : "›"}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <QuestDrawer openDrawer={openDrawer} setOpenDrawer={setOpenDrawer} />

      <Image
        priority
        src={bg}
        alt={"intro"}
        className="fixed h-full top-0 left-0 w-full -z-10 object-cover opacity-25"
      />
    </>
  );
};
