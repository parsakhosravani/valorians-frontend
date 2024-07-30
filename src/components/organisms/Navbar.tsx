"use client";
import { Route } from "next";
import {
  FriendsIcon,
  IconSvgProps,
  QuestIcon,
  ResourcesIcon,
  TribeIcon,
  BattleIcon,
} from "../atoms";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { useTelegramContext } from "@/store/telegram/hook";

type TNavbarItems = {
  icon: React.ReactElement<IconSvgProps>;
  link: Route;
  name: string;
};

const navbarItems: TNavbarItems[] = [
  {
    icon: <ResourcesIcon />,
    name: "Resources",
    link: "/resources",
  },
  {
    icon: <TribeIcon />,
    name: "Tribe",
    link: "/tribe",
  },
  {
    icon: <BattleIcon />,
    name: "Battle",
    link: "/battle",
  },
  {
    icon: <FriendsIcon />,
    name: "Friends",
    link: "/friends",
  },
  {
    icon: <QuestIcon />,
    name: "Quest",
    link: "/quest",
  },
];

export const Navbar = () => {
  const pathname = usePathname();
  const { navigateTo } = useTelegramContext()

  return (
    <div className="max-w-[400px] mx-auto text-[11px] border-t-2 border-[#019AF0] flex px-6 items-center justify-between bg-[#191F27] w-full min-h-[60px] pt-3 pb-5 rounded-t-3xl fixed bottom-0">
      {navbarItems.map((item) => (
        <div className="w-[50px] h-[50px]"
          key={item.name}
          onTouchStart={() => navigateTo(item.link)}
        >
          <div
            style={{
              cursor: "pointer",
              color: item.link === pathname ? "#FFF" : "#8C8F93",
            }}
            className="flex flex-col justify-center items-center gap-1 flex-1 text-[#8C8F93]"
          >
            {React.cloneElement(item.icon, {
              fill: item.link === pathname ? "#FFF" : "#8C8F93",
            })}
            <p>{item.name}</p>
          </div>
        </div>
      ))}
    </div>
  );
};
