"use client";
import { useTelegramContext } from "@/store/telegram/hook";
import Image from "next/image";
import avatar from "~/images/avatar.webp";

export const User = () => {
  const { user } = useTelegramContext();

  return (
    <div className="flex gap-[2px] items-center">
      <Image
        width={28}
        height={28}
        className="rounded-full"
        alt="avatar"
        src={avatar}
      />
      <div className="flex flex-col">
        <div className="text-center text-white text-[12px] font-bold">
          {user?.username}
        </div>
        <div className="text-neutral-400 text-[10px]">Rank 1000</div>
      </div>
    </div>
  );
};
