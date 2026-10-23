"use client";

import { usePathname } from "next/navigation";

import { useResourceContext, useTelegramContext } from "@/context";
import { Button, Header, Navbar, QrCode } from "@/components";

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="text-white mx-auto overflow-hidden min-h-svh max-w-md fixed w-full flex flex-col items-center">
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
        <main className="w-full flex-1 flex justify-center items-end">{children}</main>
      </Shell>
    );
  }

  if (status !== "ready") {
    return (
      <Shell>
        <main className="w-full flex-1 flex flex-col gap-4 justify-center items-center min-h-svh px-6 text-center">
          {status === "loading" ? (
            <div className="h-10 w-10 rounded-full border-4 border-[#019AF0] border-t-transparent animate-spin" />
          ) : (
            <>
              <p className="text-lg font-bold">Couldn&apos;t load your tribe</p>
              <p className="text-sm text-[#B5C7DE]">{error}</p>
              <Button onClick={retry}>Try again</Button>
            </>
          )}
        </main>
      </Shell>
    );
  }

  return (
    <Shell>
      <Header />
      <main className="w-full flex-1 flex justify-center items-center pb-[84px]">{children}</main>
      <Navbar />
    </Shell>
  );
};
