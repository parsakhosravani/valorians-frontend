import Link from "next/link";


import { useGameStatus, useLive } from "@/context";
import { plusActive } from "@/lib/game/engine";
import { grouped } from "@/lib/format";

import { Avatar } from "./Avatar";
import { GameIcon } from "@/components/atoms/GameIcon";

export const User = () => {
  const me = useGameStatus().me!;
  // Only whether Plus is on: the rest of the live state doesn't show here.
  const plus = useLive((l) => plusActive(l.state));
  const name = me.firstName || me.username || "Player";

  return (
    <Link className="flex gap-2 items-center min-w-0" href="/leaderboard">
      <Avatar className="rounded-lg border-2 border-gold" size={36} src={me.photoUrl} />
      <div className="flex flex-col min-w-0 leading-tight">
        <span className="text-parch text-sm font-extrabold truncate max-w-[150px]">
          {name}
          {plus && <span aria-label="Plus" className="ml-1" title="Valorians Plus"><GameIcon e="👑" /></span>}
        </span>
        <span className="text-goldtext text-xs font-bold">Rank #{grouped(me.rank)} ›</span>
      </div>
    </Link>
  );
};
