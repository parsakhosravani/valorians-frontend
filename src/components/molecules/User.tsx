"use client";
import { useState } from "react";
import Link from "next/link";

import { useGame } from "@/context";

import { Avatar } from "./Avatar";
import { AvatarPicker } from "./AvatarPicker";

export const User = () => {
  const { me } = useGame();
  const [picking, setPicking] = useState(false);
  const name = me.firstName || me.username || "Player";

  return (
    <div className="flex gap-2 items-center min-w-0">
      <button
        aria-label="Change avatar"
        className="relative shrink-0"
        onClick={() => setPicking(true)}
      >
        <Avatar
          className="rounded-lg border-2 border-gold"
          size={36}
          src={me.photoUrl}
        />
        <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-gold text-[#1A120B] text-[9px] flex items-center justify-center shadow">
          ✎
        </span>
      </button>
      <Link className="flex flex-col min-w-0 leading-tight" href="/leaderboard">
        <span className="text-parch text-sm font-extrabold truncate max-w-[150px]">
          {name}
        </span>
        <span className="text-goldtext text-xs font-bold">
          Rank #{me.rank.toLocaleString("en-US")} ›
        </span>
      </Link>
      <AvatarPicker isOpen={picking} onClose={() => setPicking(false)} />
    </div>
  );
};
