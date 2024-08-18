"use client";

import { useTelegramContext } from "@/context";
import { Header, Navbar, QrCode } from "@/components";
import { usePathname } from "next/navigation";

export const Main = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  const { isMobile } = useTelegramContext();
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
