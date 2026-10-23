import { createContext } from "react";

import { TelegramContextType } from "./types";

const TelegramContext = createContext<TelegramContextType>({
  telegram: null,
  user: null,
  isMobile: true,
  progressBarStart: 0,
  setProgressBarStart: () => {},
  navigateTo: () => {},
});

export default TelegramContext;
