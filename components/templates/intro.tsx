import Image from "next/image";
import background from "@/public/images/intro/cover.jpg";
import youtube from "@/public/images/intro/youtube.png";
import telegram from "@/public/images/intro/telegram.png";
import x from "@/public/images/intro/x.png";
import { ProgressBar } from "../molecules";

export const Intro = () => {
  return (
    <div className="absolute bottom-0 flex h-dvh-[90%] w-full items-center justify-center rounded-t-[50px] bg-[#0D0F12] px-4 pt-6">
      <img
        alt="background image"
        src={background.src}
        className="rounded-t-[50px]"
      />

      <div className="absolute bottom-0 flex h-64 w-60 flex-col justify-between rounded-tl-3xl rounded-tr-3xl bg-white/10 px-[57px] pb-[33px] pt-[26px] backdrop-blur-sm">
        <ProgressBar />
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
