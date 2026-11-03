"use client";
import Image from "next/image";

import intro from "~/images/background/intro.webp";
import { questUrl } from "@/lib/game/config";

/**
 * The one page for everything that can go wrong. Every failure the game can
 * catch lands here, painted like the loading screen and always with a way
 * forward, never a white error page inside Telegram:
 * - crash: a screen broke (error.tsx), or the whole frame did (global-error.tsx)
 * - missing: a link to a page that doesn't exist (not-found.tsx)
 * - offline: the game couldn't reach the server (the loading screen)
 * - maintenance: the game is down on purpose (MAINTENANCE=on, proxy.ts)
 * - down: the host itself is down, paused or its build failed; this one is
 *   shown by the launcher outside the host (launcher/index.html), which copies
 *   these words
 */
export type ErrorKind = "crash" | "missing" | "offline" | "maintenance" | "down";

export const ERROR_TEXT: Record<ErrorKind, { title: string; message: string; action: string }> = {
  crash: {
    title: "The saga stumbled",
    message: "Something broke on this screen. Your tribe is safe: nothing was lost. Try again, or come back in a moment.",
    action: "Try again",
  },
  missing: {
    title: "Lost in the fjords",
    message: "This road leads nowhere. Your tribe is waiting in the Hall.",
    action: "Back to your Hall",
  },
  offline: {
    title: "The gates won't open",
    message: "We couldn't reach your tribe. Check your connection and try again.",
    action: "Try again",
  },
  maintenance: {
    title: "Back soon, Chief",
    message:
      "The longships are in the harbour for repairs: Valorians is being upgraded. Your tribe is safe and production keeps running. Back very soon!",
    action: "Try again",
  },
  down: {
    title: "The north is quiet",
    message: "Valorians can't be reached right now. Your tribe is safe and production keeps running. We're on it: try again in a few minutes.",
    action: "Try again",
  },
};

export function ErrorPage({
  kind,
  detail,
  onAction,
  href,
}: {
  kind: ErrorKind;
  /** A more precise message (e.g. the server's own), shown instead of the default one. */
  detail?: string | null;
  /** What the button does; without it the button follows `href` (default: reload the game). */
  onAction?: () => void;
  href?: string;
}) {
  const text = ERROR_TEXT[kind];
  const news = questUrl("telegram", process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL);

  return (
    <div className="fixed inset-0 max-w-md mx-auto overflow-hidden bg-ground text-parch" data-error-kind={kind} role="alert">
      <Image priority alt="" className="absolute inset-0 w-full h-full object-cover object-[50%_30%]" placeholder="blur" src={intro} />
      <div className="absolute inset-0 bg-gradient-to-b from-ground/80 via-ground/45 to-ground" />
      <div className="relative h-full flex flex-col items-center px-8 pt-[9svh] pb-10 text-center">
        <h1 className="font-display font-black text-[42px] leading-none tracking-[0.06em] text-transparent bg-clip-text bg-gradient-to-b from-[#FBE3A6] via-goldtext to-gold drop-shadow-[0_3px_6px_rgba(0,0,0,0.9)]">
          VALORIANS
        </h1>
        <div className="flex-1" />
        <div className="w-full flex flex-col items-center gap-3 rounded-2xl bg-panel/85 border border-line p-5 backdrop-blur-sm">
          <h2 className="title-screen !text-[22px]">{text.title}</h2>
          <p className="text-sm text-sub leading-snug">{detail || text.message}</p>
          {onAction ? (
            <button className="btn btn-gold w-full" type="button" onClick={onAction}>
              {text.action}
            </button>
          ) : (
            <a className="btn btn-gold w-full" href={href ?? "/hall"}>
              {text.action}
            </a>
          )}
          {news && (
            <a className="text-xs text-goldtext underline underline-offset-2" href={news} rel="noreferrer" target="_blank">
              News on our Telegram channel
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
