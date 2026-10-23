import Image from "next/image";
import Link from "next/link";

import avatar from "~/images/avatar.webp";

import { useGame } from "@/context";

export const User = () => {
  const { me } = useGame();
  const name = me.firstName || me.username || "Player";

  return (
    <Link className="flex gap-2 items-center min-w-0" href="/leaderboard">
      {me.photoUrl ? (
        // Telegram avatars are remote; a plain img avoids next/image domain config.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="rounded-lg h-9 w-9 object-cover border-2 border-gold" src={me.photoUrl} />
      ) : (
        <Image alt="" className="rounded-lg h-9 w-9 border-2 border-gold" src={avatar} />
      )}
      <div className="flex flex-col min-w-0 leading-tight">
        <span className="text-parch text-sm font-extrabold truncate max-w-[150px]">{name}</span>
        <span className="text-goldtext text-xs font-bold">Rank #{me.rank.toLocaleString("en-US")} ›</span>
      </div>
    </Link>
  );
};
