import "@fontsource/cinzel/700.css";
import "@fontsource/cinzel/900.css";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/500.css";
import "@fontsource/alegreya-sans/700.css";
import "@fontsource/alegreya-sans/800.css";
import "@/styles/globals.css";
import type { Metadata, Viewport } from "next";
import { Main } from "@/components/organisms/Main";
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
  themeColor: "#120D09",
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
        {/* Toasts styled like the game's panels: dark wood, gold trim, ember for errors. */}
        <Toaster
          containerStyle={{ top: "calc(max(env(safe-area-inset-top, 0px), var(--tg-safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px) + 10px)" }}
          position="top-center"
          toastOptions={{
            duration: 2500,
            style: {
              background: "linear-gradient(180deg, #2A1F16 0%, #1E1610 100%)",
              color: "#EFE3CC",
              border: "1px solid #E3A948",
              borderRadius: "14px",
              boxShadow: "0 10px 28px rgba(0,0,0,0.6), inset 0 1px 0 rgba(242,198,109,0.18)",
              padding: "10px 14px",
              fontFamily: "'Alegreya Sans', sans-serif",
              fontWeight: 700,
              fontSize: "14px",
              lineHeight: 1.3,
              maxWidth: "360px",
            },
            success: { iconTheme: { primary: "#E3A948", secondary: "#1E1610" } },
            error: {
              duration: 3500,
              iconTheme: { primary: "#E8612C", secondary: "#2A140E" },
              style: {
                background: "linear-gradient(180deg, #3A1A10 0%, #2A140E 100%)",
                color: "#FFE3D6",
                border: "1px solid #E8612C",
              },
            },
            loading: { iconTheme: { primary: "#E3A948", secondary: "#4A3624" } },
          }}
        />

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
