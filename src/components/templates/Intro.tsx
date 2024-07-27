"use client";
import Image from "next/image";
import youtube from "~/images/intro/youtube.png";
import telegram from "~/images/intro/telegram.png";
import x from "~/images/intro/x.png";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export const Intro = () => {
  const [progressBarStart, setProgressBarStart] = useState(0);
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => {
      setProgressBarStart(100);
    }, 500);
    setTimeout(() => {
      router.push("/resources");
    }, 3000);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className="fixed left-0 right-0 top-0 bottom-0 bg-intro bg-cover bg-no-repeat h-full flex w-full items-end justify-center">
      <div className=" bottom-0 flex h-52 w-60 flex-col justify-between rounded-tl-3xl rounded-tr-3xl bg-white/10 px-[57px] pb-[33px] pt-[26px] backdrop-blur-sm">
        <div className="relative flex h-[11px] w-full items-center justify-left overflow-hidden rounded-full bg-white px-[2px] transition-all delay-100">
          <div
            className={clsx(
              "h-[7px] w-0 rounded bg-[#4A6B8A] transition-all duration-[3s] ease-in-out hxs:left-[1.5%] hxs:top-[50%] z-20",
              progressBarStart === 100 && "w-[99%]"
            )}
          />
        </div>
        <div className="flex w-full flex-col items-center justify-center gap-y-1">
          <div className="text-[17px] font-extrabold text-center leading-none text-white">
            Valorians Legend
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
