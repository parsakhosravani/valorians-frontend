import React, { ReactNode, useEffect, useState } from "react";
import { TelegramContextType } from "./types";
import TelegramContext, { initialUserProfileData } from "./Context";
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
  const [telegram, setTelegram] = useState<Telegram>()
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(initialUserProfileData);
  const [progressBarStart, setProgressBarStart] = useState(0);


  // Start app
  useEffect(() => {
    if (typeof window !== "undefined" && "Telegram" in window) {
      const telegram = (window as any).Telegram;
      const miniApp = (window as any).Telegram.WebApp;

      // configs
      miniApp.ready();
      miniApp.expand();
      miniApp.setHeaderColor("#000000");
      miniApp.setBackgroundColor("#27272A");

      // initial data
      setTelegram(telegram);
      setUser(miniApp.initDataUnsafe.user);
    }
  }, []);

  useDisableZoom()
  useDisableScroll(true);
  const isMobile = useMobilePlatform(telegram)

  const router = useRouter();
  const navigateTo = (address: string) => {
    telegram?.WebApp.BackButton.show();
    router.push(address as any);
  };

  const value: TelegramContextType = {
    telegram,
    user,
    userProfile,
    isMobile: process.env.NEXT_PUBLIC_IGNORE_QR_CODE ? true : isMobile,
    progressBarStart,
    setProgressBarStart,
    navigateTo
  };

  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  );
};
