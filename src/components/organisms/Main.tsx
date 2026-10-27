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
      "text-parch mx-auto overflow-hidden h-svh fixed inset-x-0 w-full flex flex-col items-center bg-ground bg-[radial-gradient(120%_70%_at_50%_0%,#22180F_0%,#120D09_60%,#0B0806_100%)]",
      "transition-[max-width] duration-500 ease-out",
      // The war map and the village grow with the window (Telegram Desktop); other pages stay phone-width.
      wide ? "max-w-6xl" : "max-w-md",
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
    <Shell wide={pathname.startsWith("/battle") || pathname.startsWith("/tribe")}>
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
