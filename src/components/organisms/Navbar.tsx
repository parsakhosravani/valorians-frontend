"use client";
import React from "react";
import Link from "next/link";
import clsx from "clsx";
import { usePathname } from "next/navigation";
import { Route } from "next";

import { useTelegramContext } from "@/context";

const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg
    aria-hidden="true"
    fill="none"
    height="24"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="24"
  >
    {children}
  </svg>
);

export const NAV_ICONS = {
  hall: (
    <Svg>
      <path d="M3 21h18M5 21V10l7-6 7 6v11" />
      <path d="M9 21v-6h6v6M3 11l9-8 9 8" />
    </Svg>
  ),
  build: (
    <Svg>
      <path d="m15 12-8.5 8.5a2.1 2.1 0 1 1-3-3L12 9" />
      <path d="M17.6 6.4 20 4M14 4l6 6-4 4-6-6z" />
    </Svg>
  ),
  war: (
    <Svg>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" />
      <path d="M9.5 17.5 21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4M5 21l-2-2" />
    </Svg>
  ),
  friends: (
    <Svg>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.4.6 4 2.8 4 6" />
    </Svg>
  ),
  trade: (
    <Svg>
      <path d="M12 3v18M5 21h14" />
      <path d="M4 7h16M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z" />
    </Svg>
  ),
  // Pickaxe (shape from Lucide, ISC licence)
  mine: (
    <Svg>
      <path d="M14.531 12.469 6.619 20.38a1 1 0 1 1-3-3l7.912-7.912" />
      <path d="M15.686 4.314A12.5 12.5 0 0 0 5.461 2.958 1 1 0 0 0 5.58 4.71a22 22 0 0 1 6.318 3.393" />
      <path d="M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z" />
      <path d="M19.686 8.314a12.501 12.501 0 0 1 1.356 10.225 1 1 0 0 1-1.751-.119 22 22 0 0 0-3.393-6.319" />
    </Svg>
  ),
};

const items: { icon: React.ReactNode; name: string; link: Route }[] = [
  { icon: NAV_ICONS.hall, name: "Hall", link: "/hall" as Route },
  { icon: NAV_ICONS.build, name: "Build", link: "/tribe" },
  { icon: NAV_ICONS.war, name: "War", link: "/battle" },
  { icon: NAV_ICONS.friends, name: "Friends", link: "/friends" },
  { icon: NAV_ICONS.mine, name: "Mine", link: "/resources" },
];

export const Navbar = () => {
  const pathname = usePathname();
  const { telegram } = useTelegramContext();

  return (
    <nav
      className={clsx(
        "max-w-md w-full grid grid-cols-5 bg-panel border-t border-line pt-2 fixed bottom-0 z-30",
        telegram?.WebApp.platform === "ios" ? "pb-6" : "pb-3",
      )}
    >
      {items.map((item) => {
        const active = item.link === pathname;

        return (
          <Link
            key={item.name}
            className={clsx(
              "flex flex-col items-center gap-0.5 text-[11px]",
              active ? "text-goldtext font-extrabold" : "text-muted font-bold",
            )}
            href={item.link}
          >
            {item.icon}
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
};
