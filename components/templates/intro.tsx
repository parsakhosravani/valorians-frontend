"use client";
import clsx from "clsx";
import { useEffect, useState } from "react";
import Image from "next/image";
import background from "@/public/images/intro/cover.jpg";
import youtube from "@/public/images/intro/youtube.png";
import telegram from "@/public/images/intro/telegram.png";
import x from "@/public/images/intro/x.png";
import { useRouter } from "next/navigation";

export const Intro = () => {
  const [progressBarStart, setProgressBarStart] = useState(0);
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => {
      setProgressBarStart(100);
    }, 500);
    setTimeout(() => {
      router.push("resources");
    }, 5000);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="absolute bottom-0 flex h-dvh-[90%] w-full items-center justify-center rounded-t-[50px] bg-[#0D0F12] px-4 pt-6">
      <img
        alt="background image"
        src={background.src}
        className="rounded-t-[50px]"
      />

      <div className="absolute bottom-0 flex h-64 w-60 flex-col justify-between rounded-tl-3xl rounded-tr-3xl bg-white/10 px-[57px] pb-[33px] pt-[26px] backdrop-blur-sm">
        <div className="relative flex h-[11px] w-full items-center justify-left overflow-hidden rounded-full bg-white px-[2px] transition-all delay-100">
          <div
            className={clsx(
              "h-[7px] w-0 rounded bg-[#B86843] transition-all duration-[3s] ease-in-out hxs:left-[1.5%] hxs:top-[50%] z-20",
              progressBarStart === 100 && "w-[99%]"
            )}
          />
        </div>

        <div className="flex w-full flex-col items-center justify-center gap-y-1">
          <div className="text-[17px] font-extrabold leading-none text-[#FC9D31]">
            Stay tuned
          </div>
          <div className="w-32 text-center text-xs font-extrabold leading-1 text-emerald-300">
            More info in official channels
          </div>
        </div>

        <div className="flex w-full items-center justify-between">
          <Image
            priority
            alt={"youtube"}
            src={youtube}
            className="h-[36px] w-[36px] hxs:h-[42px] hxs:w-[42px]"
          />
          <Image
            priority
            alt={"telegram"}
            src={telegram}
            className="h-[36px] w-[36px] hxs:h-[42px] hxs:w-[42px]"
          />
          <Image
            priority
            alt={"x"}
            src={x}
            className="h-[36px] w-[36px] hxs:h-[42px] hxs:w-[42px]"
          />
        </div>
      </div>
    </div>
  );
};
