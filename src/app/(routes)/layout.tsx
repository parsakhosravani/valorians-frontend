import type { Metadata } from "next";
import "@/styles/globals.css";
import { Navbar } from "@/components";
import { Providers } from "../providers";
import { Roboto } from "next/font/google";

import GoogleScript from "@/scripts/GoogleScript";
import TelegramScript from "@/scripts/TelegramScript";

export const metadata: Metadata = {
  title: "Valorians Legend",
  description: "Valorians legend is a mini game",
};

const roboto = Roboto({
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning lang="en" className={roboto.className}>
      <body className="bg-black text-white">
        <Providers>
          <div className="relative flex flex-col overflow-hidden h-screen">
            <main className="w-full flex-1">{children}</main>
            <Navbar />
          </div>
        </Providers>

        <GoogleScript />
        <TelegramScript />
      </body>
    </html>
  );
}
