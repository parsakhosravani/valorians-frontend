"use client";
import React from "react";
import Link from "next/link";
import clsx from "clsx";
import { usePathname } from "next/navigation";
import { Route } from "next";

import { Icon, IconName } from "@/components/ui";
import { useTelegramContext } from "@/context";

const items: { icon: IconName; name: string; link: Route }[] = [
  { icon: "hall", name: "Hall", link: "/hall" as Route },
  { icon: "build", name: "Build", link: "/tribe" },
  { icon: "war", name: "War", link: "/battle" },
  { icon: "friends", name: "Friends", link: "/friends" },
  { icon: "mine", name: "Mine", link: "/resources" },
];

export const Navbar = () => {
  const pathname = usePathname();
  const { telegram } = useTelegramContext();

  return (
    <nav
      className={clsx(
        "max-w-md w-full fixed bottom-0 z-30 px-2 pt-1.5 bg-ink-900/95 backdrop-blur border-t border-ink-500",
        telegram?.WebApp.platform === "ios" ? "pb-6" : "pb-2.5"
      )}
    >
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const active = item.link === pathname;

          return (
            <Link
              key={item.name}
              aria-current={active ? "page" : undefined}
              className={clsx("relative flex flex-col items-center gap-0.5 pt-1.5 text-caption", active ? "text-gold-300 font-extrabold" : "text-parch-500 font-bold")}
              href={item.link}
            >
              <span
                className={clsx(
                  "w-12 h-8 rounded-xl flex items-center justify-center transition-colors",
                  active && "bg-gradient-to-b from-gold-400/25 to-gold-400/5 border border-gold-500/50"
                )}
              >
                <Icon name={item.icon} size={22} />
              </span>
              {item.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
