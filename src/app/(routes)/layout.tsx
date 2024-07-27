import type { Metadata } from "next";
import "@/styles/globals.css";

import Head from "next/head";
import { Navbar } from "@/components";
import { Providers } from "../providers";

import GoogleScript from "@/scripts/GoogleScript";
import TelegramScript from "@/scripts/TelegramScript";


export const metadata: Metadata = {
  title: "Valorians Legend",
  description: "Valorians legend is a mini game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning lang="en">
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0"
        />
      </Head>
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
