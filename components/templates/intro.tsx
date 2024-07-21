import Image from "next/image";
import youtube from "@/public/images/intro/youtube.png";
import telegram from "@/public/images/intro/telegram.png";
import x from "@/public/images/intro/x.png";
import { ProgressBar } from "../molecules";

export const Intro = () => {
  return (
    <div className="bg-intro bg-cover bg-no-repeat h-full flex w-full items-end justify-center">
      <div className=" bottom-0 flex h-64 w-60 flex-col justify-between rounded-tl-3xl rounded-tr-3xl bg-white/10 px-[57px] pb-[33px] pt-[26px] backdrop-blur-sm">
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
