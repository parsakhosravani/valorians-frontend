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
      <div className="relative flex flex-col justify-start max-w-[95%] m-auto w-full h-[100vh] mt-7">
        <div className="bg-buildingBg backdrop-blur-xs min-h-[100px] w-full flex justify-end rounded-[5px]">
          <div className="w-2/6 flex flex-col justify-start relative">
            <Image
              src={viking}
              alt="avatar"
              className="absolute max-w-[130px] max-h-[130px] w-[120%] h-[120%] bottom-0 object-left-bottom object-contain"
            />
          </div>
          <div className="w-4/6 flex flex-col justify-between pl-3 py-2.5">
            <div className="text-left text-white text-base font-bold">
              Complete your tasks!
            </div>
            <div className="text-[#b0d7ec] text-xs font-normal">
              By completing tasks, you earn rewards that help you develop your
              tribe faster. Use these rewards to enhance your tribe's growth and
              strength!
            </div>
          </div>
        </div>

        <div className="flex flex-col w-full items-start mt-4">
          <div className="text-center text-white text-lg font-bold">
            Task List:
          </div>
          <div className="grid gap-2.5 w-full overflow-y-auto scrollable max-h-[50svh] pb-10">
            {ACTIVE_QUESTS.length === 0 && (
              <p className="text-sm text-[#B5C7DE]">No tasks right now. Check back soon!</p>
            )}
            {ACTIVE_QUESTS.map((item) => {
              const done = questStatus(state, item.id, now).state === "claimed";

              return (
                <button
                  key={item.id}
                  className="w-full h-12 flex gap-2 items-center px-[6px] py-[5px] bg-buildingBg backdrop-blur-xs rounded-md text-left"
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
        className="absolute h-full top-0 left-0 w-full -z-10 object-cover"
      />
    </>
  );
};
