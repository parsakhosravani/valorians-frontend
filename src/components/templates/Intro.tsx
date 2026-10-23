"use client";
import Image from "next/image";
import youtube from "~/images/social/youtube.webp";
import telegram from "~/images/social/telegram.webp";
import x from "~/images/social/x.webp";
import bg from "~/images/background/intro.webp";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useResourceContext, useTelegramContext } from "@/context";
import { questLink } from "@/components/organisms/quest/QuestDrawer";

export const Intro = () => {
  const { progressBarStart, setProgressBarStart } = useTelegramContext();
  const { status, error, retry } = useResourceContext();
  const [introDone, setIntroDone] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      setProgressBarStart(100);
    }, 300);
    const done = setTimeout(() => setIntroDone(true), 3300 + 100);

    return () => {
      clearTimeout(timer);
      clearTimeout(done);
    };
  }, []);

  // Enter the game once the intro has played AND the player has loaded.
  useEffect(() => {
    if (introDone && status === "ready") router.replace("/resources");
  }, [introDone, status]);
  return (
    <>
      <div className="h-screen flex w-full items-end justify-center">
        <div className="text-[#B1D7ED] bottom-0 flex h-52 flex-col justify-between rounded-tl-3xl rounded-tr-3xl px-[57px] pb-[33px] pt-[26px]">
          <div className="text-4xl font-[900] leading-none text-center whitespace-nowrap">
            Valorians Legend
          </div>
          <div className="flex justify-center">
            <div className="relative w-32 text-center flex items-center justify-left overflow-hidden rounded-full bg-white transition-all delay-100">
              <div
                className={clsx(
                  "h-[7px] w-0 rounded bg-[#0695E5] transition-all duration-[3s] ease-in-out hxs:left-[1.5%] hxs:top-[50%] z-20",
                  progressBarStart === 100 && "w-[100%]"
                )}
              />
            </div>
          </div>

          {status === "error" ? (
            <div className="flex text-white w-full flex-col items-center justify-center gap-y-1">
              <div className="text-[15px] font-bold text-center">{error}</div>
              <button
                className="text-[#019AF0] font-bold underline"
                onClick={retry}
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="flex text-white w-full flex-col items-center justify-center gap-y-1">
              <div className="text-[17px] font-extrabold leading-none">
                Stay tuned
              </div>
              <div className="text-center">More info in official channels</div>
            </div>
          )}

          <div className="flex w-full items-center justify-center space-x-2">
            <a href={questLink("telegram") ?? "#"} rel="noreferrer" target="_blank">
              <Image
                width={16}
                height={16}
                priority
                alt={"telegram"}
                src={telegram}
                className="hxs:h-[42px] hxs:w-[42px]"
              />
            </a>
            <a href={questLink("youtube") ?? "#"} rel="noreferrer" target="_blank">
              <Image
                width={16}
                height={16}
                priority
                alt={"youtube"}
                src={youtube}
                className="hxs:h-[42px] hxs:w-[42px]"
              />
            </a>
            <a href={questLink("x") ?? "#"} rel="noreferrer" target="_blank">
              <Image
                width={16}
                height={16}
                priority
                alt={"x"}
                src={x}
                className="hxs:h-[42px] hxs:w-[42px]"
              />
            </a>
          </div>
        </div>
        <div className="absolute bottom-2 left-2 text-xs">v0.1.0</div>
      </div>

      <Image
        priority
        src={bg}
        alt={"intro"}
        className="absolute h-full top-0 left-0 w-full -z-10 object-cover"
      />
    </>
  );
};
