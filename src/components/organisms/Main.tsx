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
  const { activeResource } = useResourceContext();

  if (!isMobile) {
    return <QrCode />;
  }

  if (isMobile) {
    return (
        <div className="px-4 text-white mx-auto overflow-hidden min-h-svh max-w-md fixed w-full flex flex-col items-center">
          <Header />
          <main className="w-full flex-1">{children}</main>
          <Navbar />

          <Image
            src={activeResource.bg}
            alt={activeResource.name}
            className="absolute h-full top-0 left-0 w-full -z-10 object-cover opacity-[0.15]"
          />
        </div>
    )
  }



}