import "@/styles/globals.css";
import type { Metadata } from "next";
import { Main } from "@/components";
import { Providers } from "../providers";
import { ResourceProvider } from "@/context/resource/ResourceContext";
import { Toaster } from "react-hot-toast";
import { Roboto } from "next/font/google";

import GoogleScript from "@/scripts/GoogleScript";
import TelegramScript from "@/scripts/TelegramScript";

export const metadata: Metadata = {
  title: "Valorians Legend",
  description: "Valorians legend is a mini game",
};

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["100", "300", "400", "500", "700", "900"],
  display: "swap",
});
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={roboto.className} suppressHydrationWarning lang="en">
      <body className="bg-black text-white mx-auto flex justify-center">
        <Toaster toastOptions={{ duration: 2000 }} position="top-center" />

        <Providers>
          <ResourceProvider>
            <Main>{children}</Main>
          </ResourceProvider>
        </Providers>

        <GoogleScript />
        <TelegramScript />
      </body>
    </html>
  );
}
