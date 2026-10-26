"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { usePathname } from "next/navigation";

import { Coin, NAV_ICONS, User } from "@/components";
import { RESOURCES, useGame } from "@/context";
import { compact } from "@/lib/format";

/** 0.75rem below the device notch plus Telegram's own full-screen controls. */
const HEADER_TOP_PADDING =
  "calc(0.75rem + max(env(safe-area-inset-top, 0px), var(--tg-safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px))";

/** Top bar on every screen (with the Market button); Build, War and Market also show your stock. */
export const Header: React.FC = () => {
  const { state, rates, me } = useGame();
  const trades = me?.activeTrades ?? 0;
  const pathname = usePathname();
  const showResources =
    pathname === "/tribe" || pathname === "/battle" || pathname === "/market";
  const onMarket = pathname === "/market";

  return (
    <header
      className="w-full flex flex-col gap-2 px-3 pb-2 z-20 bg-gradient-to-b from-ink via-ground/95 to-ground/80 backdrop-blur-sm border-b border-line/40"
      // In full-screen Telegram (e.g. iPhones with a Dynamic Island) its Close and ⋯
      // buttons float over the top corners and swallow taps on the avatar and Trade.
      // Telegram reports that area in these CSS variables (0 when not full-screen).
      style={{ paddingTop: HEADER_TOP_PADDING }}
    >
      <div className="flex items-center gap-2">
        <User />
        <div className="flex-1" />
        <div className="pill h-8 pl-1.5 pr-3 border-frame/70">
          <Coin amount={Math.floor(state.coins)} />
        </div>
        <Link
          aria-label={trades ? `Market, ${trades} active trade${trades === 1 ? "" : "s"}` : "Market"}
          className={clsx(
            "relative h-8 pl-2 pr-2.5 rounded-full border flex items-center gap-1 text-xs font-extrabold [&_img]:w-[20px] [&_img]:h-[20px]",
            onMarket
              ? "btn-gold"
              : "pill-gold",
          )}
          href="/market"
        >
          {NAV_ICONS.trade}
          Trade
          {trades > 0 && (
            <span
              aria-hidden
              className="absolute -top-1.5 -right-1.5 flex items-center justify-center bg-ember text-[#FFF4EA] text-[10px] leading-none tabular-nums rounded-full min-w-4 h-4 px-1 ring-2 ring-ground"
            >
              {trades > 9 ? "9+" : trades}
            </span>
          )}
        </Link>
      </div>

      {showResources && (
        <div className="inset grid grid-cols-4 divide-x divide-line/50 py-1">
          {RESOURCES.map((r) => {
            const full = state.resources[r.id] >= rates.capacity;
            const perHour = rates.productionPerHour[r.id];

            return (
              <div
                key={r.id}
                className="px-1 flex items-center gap-1.5 justify-center"
              >
                <Image alt={r.name} className="w-5 h-5 object-contain" src={r.img} />
                <div className="flex flex-col leading-none">
                  <span
                    className={
                      full
                        ? "text-bad text-xs font-extrabold"
                        : "text-xs font-extrabold"
                    }
                  >
                    {compact(state.resources[r.id])}
                  </span>
                  <span
                    className={
                      perHour < 0
                        ? "text-bad text-[10px] font-bold"
                        : "text-good text-[10px] font-bold"
                    }
                  >
                    {perHour >= 0 ? "+" : ""}
                    {Math.round(perHour)}/h
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </header>
  );
};
