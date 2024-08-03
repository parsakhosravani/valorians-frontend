"use client";

import { useTelegramContext } from "@/store/telegram/hook";
import { QrCode } from "../templates";
import { Header } from "./Header";
import { Navbar } from "./Navbar";
import { usePathname } from "next/navigation";

export const Main = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  const { isMobile, progressBarStart } = useTelegramContext();
  const pathname = usePathname();

  if (!isMobile) {
    return <QrCode />;
  }

  if (isMobile) {
    if (pathname !== "/") {
      return (
        <div className="text-white mx-auto overflow-hidden min-h-svh max-w-md fixed w-full flex flex-col items-center">
          <Header />
          <main className="w-full flex-1 flex justify-center items-center pb-[84px]">
            {children}
          </main>
          <Navbar />
        </div>
      );
    } else {
      return (
        <div className=" text-white mx-auto overflow-hidden min-h-svh max-w-md fixed w-full flex flex-col items-center">
          <main className="w-full flex-1 flex justify-center items-end ">
            {children}
          </main>
        </div>
      );
    }
  }
};
