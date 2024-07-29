"use client"

import { useTelegramContext } from "@/store/telegram/hook";
import { QrCode } from "../templates";
import { Header } from "./Header";
import { Navbar } from "./Navbar";
import { useResourceContext } from "@/context/ResourceContext";
import Image from "next/image";

export const Main = ({ children }: Readonly<{
  children: React.ReactNode;
}>) => {

  const { isMobile } = useTelegramContext()

  if (!isMobile) {
    return <QrCode />;
  }

  if (isMobile) {
    return (
        <div className="px-4 text-white mx-auto overflow-hidden min-h-svh max-w-md fixed w-full flex flex-col items-center">
          <Header />
          <main className="w-full flex-1 flex justify-center items-center pb-[84px]">{children}</main>
          <Navbar />

          
        </div>
    )
  }



}