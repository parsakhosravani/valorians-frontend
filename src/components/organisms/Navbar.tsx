"use client";
import { Route } from "next";
import {
  FriendsIcon,
  IconSvgProps,
  QuestIcon,
  ResourcesIcon,
  TribeIcon,
  BattleIcon,
  Col,
  Text,
  Row,
} from "@/components";
import { usePathname } from "next/navigation";
import React from "react";
import clsx from "clsx";
import { useTelegramContext } from "@/context";
import Link from "next/link";

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
  const { telegram } = useTelegramContext();

  return (
    <Row
      className={clsx(
        "max-w-[450px] border-t-2 border-[#019AF0] px-6 justify-between bg-[#191F27] w-full pt-3 rounded-t-3xl fixed bottom-0",
        telegram?.WebApp.platform === "ios" ? "pb-5" : "pb-0"
      )}
    >
      {navbarItems.map((item) => (
        <Link className="w-[50px] h-[50px]" key={item.name} href={item.link}>
          <Col className=" items-center gap-1 text-[#8C8F93]">
            {React.cloneElement(item.icon, {
              fill: item.link === pathname ? "#FFF" : "#8C8F93",
            })}
            <Text
              size="tiny"
              color={item.link === pathname ? "white" : "primary"}
            >
              {item.name}
            </Text>
          </Col>
        </Link>
      ))}
    </Row>
  );
};
