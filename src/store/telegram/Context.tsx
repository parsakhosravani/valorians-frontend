import { createContext } from "react";
import { TelegramContextType } from "./types";

const TelegramContext = createContext<TelegramContextType | undefined>(undefined);

export default TelegramContext;
