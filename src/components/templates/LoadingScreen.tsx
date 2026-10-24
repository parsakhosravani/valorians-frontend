"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

import telegramIcon from "~/images/social/telegram.webp";
import youtubeIcon from "~/images/social/youtube.webp";
import xIcon from "~/images/social/x.webp";

import { useResourceContext } from "@/context";
import { BuildingArt, Scene } from "@/art";
import { Button, Meter } from "@/components/ui";
import { questLink } from "@/components/organisms/quest/QuestDrawer";

const TIPS = [
  "Hit the glowing rune in the Daily Mine for triple rewards.",
  "Upgrade your Hideout so raiders can't take everything.",
  "Claim your streak every day — day 7 opens a chest.",
  "Rams break enemy walls. Bring some to well-defended tribes.",
  "Beaten barbarian camps can be raided again every hour.",
  "Raided while away? The Hall has a Revenge button.",
  "Town Hall level 5 gives you a second builder.",
  "A stronger City Gate turns your fence into stone walls.",
];

const MIN_SHOW_MS = 1200;
const SLOW_MS = 12000;

/** Shield with crossed axes — the Valorians crest. */
export const Crest = ({ className }: { className?: string }) => (
  <svg aria-hidden="true" className={className} viewBox="0 0 64 64">
    <path d="M32 4 55 12v17c0 15-10 24-23 31C19 53 9 44 9 29V12z" fill="#2A221A" stroke="#2B1F15" strokeLinejoin="round" strokeWidth="2.5" />
    <path d="M32 4 55 12v17c0 15-10 24-23 31z" fill="#1F1913" />
    <path d="M32 8.5 51 15v14c0 12.5-8.3 20-19 26-10.7-6-19-13.5-19-26V15z" fill="none" stroke="#F0BE5A" strokeWidth="2" />
    {/* Axes */}
    <path d="M21 44 41 22M43 44 23 22" stroke="#2B1F15" strokeLinecap="round" strokeWidth="5.5" />
    <path d="M21 44 41 22M43 44 23 22" stroke="#C99A63" strokeLinecap="round" strokeWidth="3" />
    <path d="M38 18c4-1 8 1 9 5l-5 4c-1-3-3-5-6-5z" fill="#DDD3C0" stroke="#2B1F15" strokeLinejoin="round" strokeWidth="1.6" />
    <path d="M26 18c-4-1-8 1-9 5l5 4c1-3 3-5 6-5z" fill="#BCB09A" stroke="#2B1F15" strokeLinejoin="round" strokeWidth="1.6" />
    <circle cx="32" cy="33" fill="#F0BE5A" r="3.4" stroke="#2B1F15" strokeWidth="1.4" />
  </svg>
);

/**
 * The first thing players see. Progress follows real work: fonts loading,
 * then signing in and loading the tribe. Calls onDone once ready.
 */
export const LoadingScreen = ({ onDone }: { onDone?: () => void }) => {
  const { status, error, retry } = useResourceContext();
  const [fontsReady, setFontsReady] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [slow, setSlow] = useState(false);
  const [tip, setTip] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const fonts = (document as any).fonts?.ready as Promise<unknown> | undefined;

    (fonts ?? Promise.resolve()).then(() => alive && setFontsReady(true));
    const t1 = setTimeout(() => setMinElapsed(true), MIN_SHOW_MS);
    const t2 = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 3500);

    setTip(Math.floor(Math.random() * TIPS.length));

    return () => {
      alive = false;
      clearTimeout(t1);
      clearInterval(t2);
    };
  }, []);

  // Warn (with a retry) if signing in takes unusually long.
  useEffect(() => {
    if (status !== "loading") {
      setSlow(false);

      return;
    }
    const t = setTimeout(() => setSlow(true), SLOW_MS);

    return () => clearTimeout(t);
  }, [status]);

  const ready = status === "ready" && fontsReady;

  useEffect(() => {
    if (ready && minElapsed && !doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  }, [ready, minElapsed, onDone]);

  const progress = useMemo(() => {
    const assets = fontsReady ? 35 : 10;
    const data = status === "ready" ? 65 : status === "error" ? 0 : 25;

    return Math.min(100, assets + data);
  }, [fontsReady, status]);

  const stage = status === "error" ? null : ready ? "Opening the gates…" : !fontsReady ? "Sharpening axes…" : "Rallying your tribe…";

  const socials = (
    [
      ["telegram", telegramIcon, "Telegram"],
      ["youtube", youtubeIcon, "YouTube"],
      ["x", xIcon, "X"],
    ] as const
  ).filter(([id]) => questLink(id));

  return (
    <div className="fixed inset-0 max-w-md mx-auto overflow-hidden bg-ink-900 text-parch">
      <Scene className="absolute inset-0 w-full h-full motion-safe:animate-kenburns" kind="dusk" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink-900/50 via-ink-900/10 to-ink-900" />

      <div className="relative h-full flex flex-col items-center px-8 pt-[16svh] pb-8">
        <Crest className="w-24 h-24 drop-shadow-[0_6px_24px_rgba(240,190,90,0.35)]" />
        <h1 className="mt-4 font-display font-extrabold text-[52px] leading-none tracking-[0.04em] text-transparent bg-clip-text bg-gradient-to-b from-gold-200 via-gold-300 to-gold-500 drop-shadow-[0_3px_0_rgba(14,11,8,0.8)]">
          VALORIANS
        </h1>
        <div className="mt-1 flex items-center gap-3 text-gold-300">
          <span className="h-px w-10 bg-gradient-to-r from-transparent to-gold-400" />
          <span className="font-display font-bold text-xl tracking-[0.5em] pl-[0.5em]">LEGEND</span>
          <span className="h-px w-10 bg-gradient-to-l from-transparent to-gold-400" />
        </div>

        <div className="flex-1" />

        {status === "error" ? (
          <div className="w-full flex flex-col items-center gap-3 text-center" role="alert">
            <BuildingArt className="w-28 h-28 grayscale opacity-80" id="city-gate" level={1} />
            <p className="font-display font-bold text-display-md">The gates won&apos;t open</p>
            <p className="text-small text-parch-300">{error || "We couldn't reach your tribe. Check your connection."}</p>
            <Button icon="refresh" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center gap-3">
            <Meter className="max-w-[280px]" label="Loading" max={100} size="md" tone="ember" value={progress} />
            <p className="text-small font-extrabold text-gold-300 h-5">{stage}</p>
            {slow ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-caption text-parch-300">This is taking longer than usual.</p>
                <Button size="sm" variant="ghost" onClick={retry}>
                  Try again
                </Button>
              </div>
            ) : (
              <p className="text-small text-parch-300 text-center leading-snug min-h-[36px] max-w-[300px]">{TIPS[tip]}</p>
            )}
          </div>
        )}

        <div className="mt-6 w-full flex items-center justify-between text-caption text-parch-500">
          <span>
            v{process.env.NEXT_PUBLIC_APP_VERSION} · build {process.env.NEXT_PUBLIC_BUILD_ID}
          </span>
          <span className="flex items-center gap-2">
            {socials.map(([id, icon, label]) => (
              <a key={id} aria-label={label} href={questLink(id)!} rel="noreferrer" target="_blank">
                <Image alt="" className="w-6 h-6 opacity-80" src={icon} />
              </a>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
};
