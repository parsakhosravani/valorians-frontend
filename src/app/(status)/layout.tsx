import "@fontsource/cinzel/900.css";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/700.css";
import "@/styles/globals.css";
import type { Metadata, Viewport } from "next";

/**
 * Pages that must work while the game doesn't (maintenance): no providers, no
 * game state, nothing that calls the API.
 */
export const metadata: Metadata = { title: "Valorians Legend", robots: { index: false } };
export const viewport: Viewport = { themeColor: "#120D09", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ground text-parch mx-auto flex justify-center">{children}</body>
    </html>
  );
}
