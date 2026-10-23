import Image from "next/image";

import avatar from "~/images/avatar.webp";

import { useGame } from "@/context";

export const User = () => {
  const { me } = useGame();
  const name = me.username || me.firstName || "Player";

  return (
    <div className="flex gap-1 items-center">
      {me.photoUrl ? (
        // Telegram avatars are remote; a plain img avoids next/image domain config.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="avatar" className="rounded h-7 w-7 object-cover" src={me.photoUrl} />
      ) : (
        <Image alt="avatar" className="rounded h-7 w-7" src={avatar} />
      )}
      <div className="flex flex-col">
        <div className="text-white text-[12px] font-bold max-w-[72px] truncate">{name}</div>
        <div className="text-neutral-400 text-[10px]">Rank {me.rank.toLocaleString("en-US")}</div>
      </div>
    </div>
  );
};
