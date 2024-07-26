"use client"
import { useTelegramContext } from "@/store/telegram/hook";

export const User = () => {
  const { user } = useTelegramContext();

  return (
    <div className="flex gap-[2px] items-center">
      <img
        className="rounded-full flex-shrink-0 w-[28px] h-[28px]"
        src="./images/avatar.webp"
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
