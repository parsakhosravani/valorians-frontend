import React, { ReactNode, useEffect, useState } from "react";
import { TelegramContextType } from "./types";
import TelegramContext, { initialUserProfileData } from "./Context";
import useDisableZoom from "@/hooks/useDisableZoom";

interface TelegramProviderProps {
  children: ReactNode;
}

export const TelegramProvider: React.FC<TelegramProviderProps> = ({
  children,
}) => {
  const [telegram, setTelegram] = useState(null)
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(initialUserProfileData);

  // Start app
  useEffect(() => {
    if (typeof window !== "undefined" && "Telegram" in window) {
      const telgram = (window as any).Telegram.WebApp;

      // configs
      telgram.ready();
      telgram.expand();
      telgram.setHeaderColor("#000000");
      telgram.setBackgroundColor("#27272A");

      // initial data
      setTelegram(telegram);
      setUser(telgram.initDataUnsafe.user);
    }
  }, []);

  useDisableZoom()

  const value: TelegramContextType = {
    telegram,
    user,
    userProfile
  };

  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  );
};
