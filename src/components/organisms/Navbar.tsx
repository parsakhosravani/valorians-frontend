"use client";
import React from "react";
import Link from "next/link";
import clsx from "clsx";
import { usePathname } from "next/navigation";
import { Route } from "next";

import { useTelegramContext } from "@/context";

/** Painted menu icon (public/images/nav/<name>.webp). Parents size and dim it via [&_img]. */
const NavImg = ({ name }: { name: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img alt="" aria-hidden="true" className="w-7 h-7 object-contain transition" draggable={false} src={`/images/nav/${name}.webp`} />
);

export const NAV_ICONS = {
  hall: <NavImg name="hall" />,
  build: <NavImg name="build" />,
  war: <NavImg name="war" />,
  clan: <NavImg name="clan" />,
  trade: <NavImg name="trade" />,
  mine: <NavImg name="mine" />,
};

const items: { icon: React.ReactNode; name: string; link: Route }[] = [
  { icon: NAV_ICONS.hall, name: "Hall", link: "/hall" as Route },
  { icon: NAV_ICONS.build, name: "Build", link: "/tribe" },
  { icon: NAV_ICONS.war, name: "War", link: "/battle" },
  { icon: NAV_ICONS.clan, name: "Clan", link: "/clan" as Route },
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
              active
                ? "text-goldtext font-extrabold [&_img]:scale-110 [&_img]:drop-shadow-[0_0_6px_rgba(227,169,72,0.75)]"
                : "text-muted font-bold [&_img]:opacity-70 [&_img]:saturate-50",
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
