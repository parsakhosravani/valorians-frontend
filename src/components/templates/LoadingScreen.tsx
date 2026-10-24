"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import bg from "~/images/background/battle.webp";
import hallBg from "~/images/background/tribe.webp";
import coin from "~/images/resources/coin.webp";
import iron from "~/images/resources/iron.webp";
import wood from "~/images/resources/wood.webp";
import clay from "~/images/resources/clay.webp";
import crop from "~/images/resources/crop.webp";
import telegramIcon from "~/images/social/telegram.webp";
import youtubeIcon from "~/images/social/youtube.webp";
import xIcon from "~/images/social/x.webp";

import { useResourceContext } from "@/context";
import { questLink } from "@/components/organisms/quest/QuestDrawer";

/** Art every first screen needs; warming the cache avoids pop-in after loading. */
const PRELOAD = [hallBg.src, coin.src, iron.src, wood.src, clay.src, crop.src, "/images/buildings/Town%20Hall.webp"];

const TIPS = [
  "Hit the glowing rune in the Daily Mine for triple rewards.",
  "Upgrade your Hideout so raiders can't take everything.",
  "Claim your streak every day — day 7 opens a chest.",
  "Rams break enemy walls. Bring some to well-defended tribes.",
  "Beaten barbarian camps can be raided again every hour.",
  "Raided while away? The Hall has a Revenge button.",
  "Town Hall level 5 gives you a second builder.",
];

const MIN_SHOW_MS = 1200;
const SLOW_MS = 12000;

const Emblem = () => (
  <svg aria-hidden="true" className="w-24 h-24 drop-shadow-[0_0_24px_rgba(227,169,72,0.45)]" viewBox="0 0 64 64">
    <path
      d="M32 5 54 13v16c0 14-10 23-22 30C20 52 10 43 10 29V13z"
      fill="#1E1610"
      stroke="#E3A948"
      strokeLinejoin="round"
      strokeWidth="2.5"
    />
    <path d="M32 11 48 17v12c0 10-7 17-16 22-9-5-16-12-16-22V17z" fill="none" stroke="#6B4A2B" strokeWidth="1.2" />
    <path d="M22 21l20 20M42 21 22 41" stroke="#F2C66D" strokeLinecap="round" strokeWidth="3.5" />
    <path
      d="M18.5 18.5l6.5 1-1 6.5M45.5 18.5l-6.5 1 1 6.5"
      fill="none"
      stroke="#E8612C"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.5"
    />
    <circle cx="32" cy="31" fill="#E3A948" r="3" />
  </svg>
);

const EMBERS = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i * 0.7) % 6,
  duration: 6 + ((i * 13) % 5),
  size: 2 + (i % 3),
}));

/**
 * The first thing players see. Progress follows real work: art downloading,
 * then signing in and loading the tribe. Calls onDone once ready.
 */
export const LoadingScreen = ({ onDone }: { onDone?: () => void }) => {
  const { status, error, retry } = useResourceContext();
  const [assetsLoaded, setAssetsLoaded] = useState(0);
  const [minElapsed, setMinElapsed] = useState(false);
  const [slow, setSlow] = useState(false);
  const [tip, setTip] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    let alive = true;

    PRELOAD.forEach((src) => {
      const img = new window.Image();
      const done = () => alive && setAssetsLoaded((n) => n + 1);

      img.onload = done;
      img.onerror = done; // a missing image shouldn't block the game
      img.src = src;
    });
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

  const assetsDone = assetsLoaded >= PRELOAD.length;
  const ready = status === "ready" && assetsDone;

  useEffect(() => {
    if (ready && minElapsed && !doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  }, [ready, minElapsed, onDone]);

  const progress = useMemo(() => {
    const art = (assetsLoaded / PRELOAD.length) * 55;
    const data = status === "ready" ? 45 : status === "error" ? 0 : 20;

    return Math.min(100, Math.round(art + data));
  }, [assetsLoaded, status]);

  const stage =
    status === "error"
      ? null
      : ready
      ? "Opening the gates…"
      : !assetsDone
      ? "Sharpening axes…"
      : "Rallying your tribe…";

  const socials = (
    [
      ["telegram", telegramIcon, "Telegram"],
      ["youtube", youtubeIcon, "YouTube"],
      ["x", xIcon, "X"],
    ] as const
  ).filter(([id]) => questLink(id));

  return (
    <div className="fixed inset-0 max-w-md mx-auto overflow-hidden bg-ground text-parch">
      <Image
        priority
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-top motion-safe:animate-kenburns"
        placeholder="blur"
        src={bg}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-ground/30 via-ground/40 to-ground" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(232,97,44,0.18),transparent_60%)]" />

      <div aria-hidden="true" className="absolute inset-0 pointer-events-none motion-reduce:hidden">
        {EMBERS.map((e, i) => (
          <span
            key={i}
            className="absolute bottom-0 rounded-full bg-[#FFB27A] animate-ember"
            style={{
              left: `${e.left}%`,
              width: e.size,
              height: e.size,
              animationDelay: `${e.delay}s`,
              animationDuration: `${e.duration}s`,
              boxShadow: "0 0 8px #E8612C",
            }}
          />
        ))}
      </div>

      <div className="relative h-full flex flex-col items-center px-8 pt-[22svh] pb-8">
        <Emblem />
        <h1 className="mt-5 font-display font-black text-[44px] leading-none tracking-[0.06em] text-transparent bg-clip-text bg-gradient-to-b from-[#FBE3A6] via-goldtext to-gold drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]">
          VALORIANS
        </h1>
        <div className="mt-2 flex items-center gap-3 text-goldtext">
          <span className="h-px w-10 bg-gradient-to-r from-transparent to-gold" />
          <span className="font-display font-bold text-lg tracking-[0.5em] pl-[0.5em]">LEGEND</span>
          <span className="h-px w-10 bg-gradient-to-l from-transparent to-gold" />
        </div>

        <div className="flex-1" />

        {status === "error" ? (
          <div className="w-full flex flex-col items-center gap-3 text-center" role="alert">
            <p className="font-display font-bold text-lg">The gates won&apos;t open</p>
            <p className="text-sm text-sub">{error || "We couldn't reach your tribe. Check your connection."}</p>
            <button
              className="h-11 px-8 rounded-xl bg-gold text-[#1A120B] font-display font-black"
              onClick={retry}
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center gap-3">
            <div
              aria-label="Loading"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={progress}
              className="w-full max-w-[280px] h-3 rounded-full bg-panel/90 border border-line p-[2px]"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold via-goldtext to-ember transition-[width] duration-500 ease-out shadow-[0_0_10px_rgba(232,97,44,0.6)]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm font-bold text-goldtext h-5">{stage}</p>
            {slow ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-xs text-sub">This is taking longer than usual.</p>
                <button className="text-sm font-extrabold text-goldtext underline" onClick={retry}>
                  Try again
                </button>
              </div>
            ) : (
              <p className={clsx("text-[13px] text-sub text-center leading-snug min-h-[36px] max-w-[300px]")}>
                {TIPS[tip]}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 w-full flex items-center justify-between text-[11px] text-muted">
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
