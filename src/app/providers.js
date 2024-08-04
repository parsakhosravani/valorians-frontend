'use client';

import { TelegramProvider } from "@/context";



export function Providers({ children }) {

    return (
        <TelegramProvider>
            {children}
        </TelegramProvider>
    );
}