"use client"

import { useTelegramContext } from "@/store/telegram/hook";
import { QrCode } from "../templates";
import { Header } from "./Header";
import { Navbar } from "./Navbar";

export const Main = ({ children }: Readonly<{
  children: React.ReactNode;
}>) => {

  const { isMobile } = useTelegramContext()

  if (!isMobile) {
    return <QrCode />;
  }

  if (isMobile) {
    return (
      <>
        <div className="relative flex flex-col overflow-hidden h-screen">
          <Header />
          <main className="w-full flex-1">{children}</main>
          <Navbar />
        </div>
      </>
    )
  }



}