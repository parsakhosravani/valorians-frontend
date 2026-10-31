import React, { ReactNode, useEffect, useState } from "react";
import { TelegramContextType } from "./types";
import TelegramContext from "./Context";
import useDisableZoom from "@/hooks/useDisableZoom";
import useDisableScroll from "@/hooks/useDisableScroll";
import { Telegram } from "@twa-dev/types";
import { useTelegramBackButton } from "@/hooks/useBackHandler";

interface TelegramProviderProps {
  children: ReactNode;
}

export const TelegramProvider: React.FC<TelegramProviderProps> = ({
  children,
}) => {
  const [telegram, setTelegram] = useState<Telegram>();
  const [user, setUser] = useState(null);

  // Start app
  useEffect(() => {
    if (typeof window !== "undefined" && "Telegram" in window) {
      const telegram = (window as any).Telegram;
      const miniApp = (window as any).Telegram.WebApp;

      // Opened in a normal browser (Telegram Desktop may still be handing over
      // its launch data, which lib/api reads from the URL hash as a fallback).
      if (!miniApp.initData && !window.location.hash.includes("tgWebAppData")) return;

      // configs
      miniApp.ready();
      miniApp.expand();
      // Let players pan the village map without swiping the app closed.
      miniApp.disableVerticalSwipes?.();
      miniApp.setHeaderColor("#120D09");
      miniApp.setBackgroundColor("#120D09");
      miniApp.setBottomBarColor?.("#1E1610");

      // Battle news comes from the bot: ask once for permission to message.
      try {
        const asked = localStorage.getItem("valorians:asked-write-access");
        const allowed = miniApp.initDataUnsafe?.user?.allows_write_to_pm;

        if (!allowed && !asked && miniApp.isVersionAtLeast?.("6.9")) {
          localStorage.setItem("valorians:asked-write-access", "1");
          setTimeout(() => miniApp.requestWriteAccess?.(), 2500);
        }
      } catch {}

      // initial data
      setTelegram(telegram);
      setUser(miniApp.initDataUnsafe.user);
    }
  }, []);

  useDisableZoom();
  useDisableScroll(true);

  // Telegram's back button, for every page and drawer (see useBackHandler).
  useTelegramBackButton(telegram);


  const value: TelegramContextType = {
    telegram,
    user,
  };

  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  );
};
