import { Navbar } from "@/components";
import type { Metadata } from "next";
import Head from "next/head";
import "@/styles/globals.css";

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
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
      </Head>
      <body className="bg-black overflow-hidden">
        <div className="relative flex flex-col h-screen max-w-md mx-auto bg-transparent text-white">
          <main className="w-full flex-1">{children}</main>
          <Navbar />
        </div>
      </body>
    </html>
  );
}
