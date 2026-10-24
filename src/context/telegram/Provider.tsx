import React, { ReactNode, useEffect, useState } from "react";
import { TelegramContextType } from "./types";
import TelegramContext from "./Context";
import useDisableZoom from "@/hooks/useDisableZoom";
import useDisableScroll from "@/hooks/useDisableScroll";
import useMobilePlatform from "@/hooks/useMobilePlatform";
import { Telegram } from "@twa-dev/types";
import { useRouter } from "next/navigation";

interface TelegramProviderProps {
  children: ReactNode;
}

export const TelegramProvider: React.FC<TelegramProviderProps> = ({
  children,
}) => {
  const [telegram, setTelegram] = useState<Telegram>();
  const [user, setUser] = useState(null);
  const [progressBarStart, setProgressBarStart] = useState(0);

  // Start app
  useEffect(() => {
    if (typeof window !== "undefined" && "Telegram" in window) {
      const telegram = (window as any).Telegram;
      const miniApp = (window as any).Telegram.WebApp;

      if (!miniApp.initData) return; // opened in a normal browser

      // configs
      miniApp.ready();
      miniApp.expand();
      // Let players pan the village map without swiping the app closed.
      miniApp.disableVerticalSwipes?.();
      miniApp.setHeaderColor("#15110D");
      miniApp.setBackgroundColor("#15110D");
      miniApp.setBottomBarColor?.("#15110D");

      // initial data
      setTelegram(telegram);
      setUser(miniApp.initDataUnsafe.user);
    }
  }, []);

  useDisableZoom();
  useDisableScroll(true);
  const isMobile = useMobilePlatform(telegram);

  const router = useRouter();
  const navigateTo = (address: string, actionType: "on" | "off" = "on") => {
    if (actionType === "on") {
      telegram?.WebApp.BackButton.show();
    } else {
      telegram?.WebApp.BackButton.hide();
    }
    router.push(address as any);
  };

  const value: TelegramContextType = {
    telegram,
    user,
    isMobile: process.env.NEXT_PUBLIC_IGNORE_QR_CODE ? true : isMobile,
    progressBarStart,
    setProgressBarStart,
    navigateTo,
  };

  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  );
};
