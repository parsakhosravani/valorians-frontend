import { useContext } from "react";
import { TelegramContextType } from "./types";
import TelegramContext from "./Context";

export const useTelegramContext = (): TelegramContextType => {
  const context = useContext(TelegramContext);
  if (context === undefined) {
    throw new Error(
      "useTelegramContext must be used within a TelegramProvider"
    );
  }
  return context;
};
