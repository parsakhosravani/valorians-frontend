'use client';

import { TelegramProvider } from "@/store/telegram/provider";

export function Providers({ children }) {

    return (
        <TelegramProvider>
            {children}
        </TelegramProvider>
    );
}