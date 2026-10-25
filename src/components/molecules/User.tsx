import Link from "next/link";


import { useGame } from "@/context";

import { Avatar } from "./Avatar";

export const User = () => {
  const { me } = useGame();
  const name = me.firstName || me.username || "Player";

  return (
    <Link className="flex gap-2 items-center min-w-0" href="/leaderboard">
      <Avatar className="rounded-lg border-2 border-gold" size={36} src={me.photoUrl} />
      <div className="flex flex-col min-w-0 leading-tight">
        <span className="text-parch text-sm font-extrabold truncate max-w-[150px]">{name}</span>
        <span className="text-goldtext text-xs font-bold">Rank #{me.rank.toLocaleString("en-US")} ›</span>
      </div>
    </Link>
  );
};
