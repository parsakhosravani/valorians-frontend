import React, { ReactNode, useEffect, useState } from "react";
import { TelegramContextType, TelegramUser } from "./types";
import TelegramContext from "./Context";

interface TelegramProviderProps {
  children: ReactNode;
}

export const TelegramProvider: React.FC<TelegramProviderProps> = ({
  children,
}) => {
  const [user, setUser] = useState(null);

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
      setUser(telgram.initDataUnsafe.user);
    }
  }, []);

  const value: TelegramContextType = {
    user,
  };

  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  );
};
