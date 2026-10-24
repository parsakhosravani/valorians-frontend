import Link from "next/link";

import { Avatar } from "@/components/ui";
import { useGame } from "@/context";

export const User = () => {
  const { me } = useGame();
  const name = me.firstName || me.username || "Player";

  return (
    <Link className="flex gap-2.5 items-center min-w-0" href="/leaderboard">
      <Avatar ring seed={me.id} size={38} src={me.photoUrl} />
      <div className="flex flex-col min-w-0 leading-tight">
        <span className="font-display font-bold text-[17px] truncate max-w-[160px]">{name}</span>
        <span className="text-caption font-extrabold text-gold-300 tracking-wide">RANK #{me.rank.toLocaleString("en-US")} ›</span>
      </div>
    </Link>
  );
};
