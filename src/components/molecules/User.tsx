"use client";
import { useTelegramContext } from "@/context";
import Image from "next/image";
import avatar from "~/images/avatar.webp";

export const User = () => {
  const { user } = useTelegramContext();

  return (
    <div className="flex gap-1 items-center">
      <Image className="rounded h-7 w-7" alt="avatar" src={avatar} />
      <div className="flex flex-col">
        <div className="text-center text-white text-[12px] font-bold">
          <div className="text-center text-white text-[12px] font-bold">
            {`${user?.username?.slice(0, 8)}...`}
          </div>
        </div>
        <div className="text-neutral-400 text-[10px]">Rank 1000</div>
      </div>
    </div>
  );
};
