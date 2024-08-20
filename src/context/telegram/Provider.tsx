import React, { ReactNode, useEffect, useState } from "react";
import { TelegramContextType } from "./types";
import TelegramContext, { initialUserProfileData } from "./Context";
import useDisableZoom from "@/hooks/useDisableZoom";
import useDisableScroll from "@/hooks/useDisableScroll";
import useMobilePlatform from "@/hooks/useMobilePlatform";
import { Telegram } from "@twa-dev/types";
import { useRouter } from "next/navigation";
import { fetcher } from "@/app/api/fetcher";

interface TelegramProviderProps {
  children: ReactNode;
}

export const TelegramProvider: React.FC<TelegramProviderProps> = ({
  children,
}) => {
  const [telegram, setTelegram] = useState<Telegram>();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(initialUserProfileData);
  const [progressBarStart, setProgressBarStart] = useState(0);
  const sendContactToBackend = (contact: any) => {
    fetcher("/auth/api/login", {
      body: JSON.stringify(contact as any),
      method: "POST",
    })
      .then(({ data }) => {
        setUserProfile(data);
      })
      .catch((res: any) => {
        console.log(res);
      });
  };
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
      process.env.NODE_ENV === "production" &&
        miniApp.requestContact().then((contact: any) => {
          sendContactToBackend(contact);
        });
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
    userProfile,
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
