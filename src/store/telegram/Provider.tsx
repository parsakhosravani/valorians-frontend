import React, { ReactNode, useEffect, useState } from "react";
import { TelegramContextType } from "./types";
import TelegramContext, { initialUserProfileData } from "./Context";
import useDisableZoom from "@/hooks/useDisableZoom";
import useDisableScroll from "@/hooks/useDisableScroll";
import useMobilePlatform from "@/hooks/useMobilePlatform";
import { Telegram } from "@twa-dev/types";

interface TelegramProviderProps {
  children: ReactNode;
}

export const TelegramProvider: React.FC<TelegramProviderProps> = ({
  children,
}) => {
  const [telegram, setTelegram] = useState<Telegram>()
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(initialUserProfileData);

  // Start app
  useEffect(() => {
    if (typeof window !== "undefined" && "Telegram" in window) {
      const telgram = (window as any).Telegram;
      const miniApp = (window as any).Telegram.WebApp;

      // configs
      miniApp.ready();
      miniApp.expand();
      miniApp.setHeaderColor("#000000");
      miniApp.setBackgroundColor("#27272A");

      // initial data
      setTelegram(telgram);
      setUser(miniApp.initDataUnsafe.user);
    }
  }, []);

  useDisableZoom()
  useDisableScroll(true); 
  const isMobile = useMobilePlatform(telegram)

  const value: TelegramContextType = {
    telegram,
    user,
    userProfile,
    isMobile: process.env.NEXT_PUBLIC_IGNORE_QR_CODE ? true : isMobile
  };

  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  );
};
