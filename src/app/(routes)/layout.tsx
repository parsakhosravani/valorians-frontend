import "@/styles/globals.css";
import type { Metadata } from "next";
import { Navbar, Header } from "@/components";
import { Providers } from "../providers";
import { Roboto } from "next/font/google";
import { ResourceProvider } from "@/context/ResourceContext";
import { Toaster } from "react-hot-toast";

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
        <Toaster toastOptions={{ duration: 2000 }} position="top-center" />

        <Providers>
           <ResourceProvider>
            <div className="relative flex flex-col overflow-hidden h-screen">
              <Header />
              <main className="w-full flex-1">{children}</main>
              <Navbar />
            </div>
          </ResourceProvider>

        </Providers>
        <GoogleScript />
        <TelegramScript />
      </body>
    </html>
  );
}
