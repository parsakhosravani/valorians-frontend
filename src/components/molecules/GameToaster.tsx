"use client";
import { ToastBar, Toaster, toast } from "react-hot-toast";

/**
 * Toasts styled like the game's panels (dark wood, gold trim, ember for
 * errors), dropping in at the top of the screen, just under Telegram's own
 * buttons in full-screen mode.
 *
 * They used to sit above the bottom bar, because at the top a toast covered
 * the header for a few seconds and swallowed taps meant for your profile or
 * the Trade button. Now a tap on a toast simply dismisses it, so it never
 * gets in the way for long.
 */
const TOP =
  "calc(0.5rem + max(env(safe-area-inset-top, 0px), var(--tg-safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px))";

export const GameToaster = () => (
  <Toaster
    containerStyle={{ top: TOP }}
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
  >
    {(t) => (
      <div
        className="cursor-pointer"
        role="button"
        tabIndex={-1}
        onClick={() => t.type !== "loading" && toast.dismiss(t.id)}
      >
        <ToastBar toast={t} />
      </div>
    )}
  </Toaster>
);
