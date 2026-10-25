"use client";

import { usePathname } from "next/navigation";
import clsx from "clsx";

import { useResourceContext, useTelegramContext } from "@/context";
import { Header, LoadingScreen, Navbar, QrCode } from "@/components";

const Shell = ({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) => (
  <div
    className={clsx(
      "text-parch mx-auto overflow-hidden h-svh max-w-md fixed inset-x-0 w-full flex flex-col items-center bg-ground",
      // On big screens (Telegram Desktop) the war map gets the room.
      wide && "lg:max-w-6xl",
    )}
  >
    {children}
  </div>
);

export const Main = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  const { isMobile } = useTelegramContext();
  const { status, error, retry } = useResourceContext();
  const pathname = usePathname();

  if (!isMobile || status === "no-auth") {
    return <QrCode />;
  }

  // The intro screen handles its own loading and error display.
  if (pathname === "/") {
    return (
      <Shell>
        <main className="w-full flex-1 flex justify-center items-end">
          {children}
        </main>
      </Shell>
    );
  }

  // Deep links (e.g. /battle) show the same loading screen until the tribe is in.
  if (status !== "ready") {
    return <LoadingScreen />;
  }

  return (
    <Shell wide={pathname.startsWith("/battle")}>
      <div className="w-full max-w-md">
        <Header />
      </div>
      <main className="relative w-full flex-1 overflow-y-auto overflow-x-hidden scrollable pb-24">
        {children}
      </main>
      <Navbar />
    </Shell>
  );
};
