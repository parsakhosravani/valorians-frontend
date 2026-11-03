"use client";

import "@fontsource/cinzel/900.css";
import "@fontsource/alegreya-sans/700.css";
import "@/styles/globals.css";

import { ErrorPage } from "@/components/templates/ErrorPage";

/** The game's frame itself failed (the layout, not one screen): it brings its own <html>, then the one error page. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-ground text-parch">
        <ErrorPage
          kind="crash"
          onAction={() => {
            reset();
            window.location.reload();
          }}
        />
      </body>
    </html>
  );
}
