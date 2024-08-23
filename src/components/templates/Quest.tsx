"use client";
import React, { FunctionComponent, useState } from "react";
import bg from "~/images/background/friends.webp";
import population from "~/images/resources/population.webp";
import viking from "~/images/quest/viking.png";
import Image from "next/image";
import {
  Silver,
  QuestDrawer,
  QuestDrawerContent,
  socialLinks,
  TextImage,
} from "@/components";

interface QuestPropsType {}

export const Quest: FunctionComponent<QuestPropsType> = () => {
  const [openDrawer, setOpenDrawer] = useState<QuestDrawerContent | null>(null);

  const handleDrawerOpen = (type: QuestDrawerContent) => {
    setOpenDrawer(type);
  };

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
            {socialLinks.map((item) => (
              <div
                key={item.title}
                className="w-full h-12 flex gap-2 items-center px-[6px] py-[5px] bg-buildingBg backdrop-blur-xs rounded-md"
              >
                <Image src={item.icon} width={34} height={34} alt="social" />
                <div
                  onClick={() =>
                    handleDrawerOpen(item.title as QuestDrawerContent)
                  }
                  className="flex flex-col justify-start gap-[5px]"
                >
                  <div className="leading-none font-bold">{item.title}</div>
                  <div className="flex gap-3">
                    <Silver amount={1000} />
                    <b className="text-xs">and</b>
                    <TextImage
                      direction="row"
                      imgSrc={population}
                      imgAlt="population"
                      title="+10"
                      size="small"
                    />
                    <TextImage
                      direction="row"
                      imgSrc={population}
                      imgAlt="populationPerHour"
                      title="+4"
                      size="small"
                    />
                  </div>
                </div>
              </div>
            ))}
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
