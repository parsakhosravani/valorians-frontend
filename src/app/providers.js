'use client';

import { TelegramProvider } from "@/store/telegram/Provider";

export function Providers({ children }) {

    return (
        <TelegramProvider>
            {children}
        </TelegramProvider>
    );
}