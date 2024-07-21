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
        src="https://s3-alpha-sig.figma.com/img/d905/0762/c4c97cb500dabbfec2ab8f24c7c81a65?Expires=1722211200&Key-Pair-Id=APKAQ4GOSFWCVNEHN3O4&Signature=XlR-BU1~tty5-stTlo7HPwVaw5eUPh4j0vYoQECNWE~W1GcCFE5UauReFcqkSCSM6RJQ9vPOe7HoAqP2CW6wOJ0R7520zZfnfeQnhoWIcNkUB11aLrlCjZkLXoC32-9w1KJII8RhXe4pU5jAJKeqiqCup0B6EnwTBqQnr0X7Kv5KONctoR1s4TmAUb7Tzkx-TY7YYlckgb8NRwlK3~mcJOte3AqvkmyhSRiC1tItA8uTI6vUBrKSffJOrW9AFh9gju8X9kNOwUa6Yp~yCMEhi1MMjn54NjTOMyQmv3YNjg4NXUfZjW9Lg2KUyHnslUz-~KCFnMJV19gCg1J6r3oh9w__"
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
