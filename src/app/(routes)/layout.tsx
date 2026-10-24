import "@fontsource/grenze/600.css";
import "@fontsource/grenze/700.css";
import "@fontsource/grenze/800.css";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/nunito/900.css";
import "@/styles/globals.css";
import type { Metadata, Viewport } from "next";
import { Main } from "@/components";
import { Providers } from "../providers";
import { ResourceProvider } from "@/context/resource/ResourceContext";
import { Toaster } from "react-hot-toast";

import GoogleScript from "@/scripts/GoogleScript";
import TelegramScript from "@/scripts/TelegramScript";

export const metadata: Metadata = {
  title: "Valorians Legend",
  description:
    "Build your Viking tribe, train an army and raid rival clans in this Telegram strategy game.",
  applicationName: "Valorians Legend",
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: "#15110D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning lang="en">
      <body className="bg-ground text-parch mx-auto flex justify-center">
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
