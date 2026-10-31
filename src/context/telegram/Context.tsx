import { createContext } from "react";

import { TelegramContextType } from "./types";

const TelegramContext = createContext<TelegramContextType>({
  telegram: null,
  user: null,
});

export default TelegramContext;
