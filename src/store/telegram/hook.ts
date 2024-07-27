import { useContext } from "react";
import TelegramContext from "./context";
import { TelegramContextType } from "./types";

export const useTelegramContext = (): TelegramContextType => {
    const context = useContext(TelegramContext);
    if (context === undefined) {
        throw new Error('useTelegramContext must be used within a TelegramProvider');
    }
    return context;
};
