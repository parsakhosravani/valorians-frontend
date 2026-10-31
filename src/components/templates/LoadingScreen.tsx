"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import bg from "~/images/background/intro.webp";
import hallBg from "~/images/background/tribe.webp";
import coin from "~/images/resources/coin.webp";
import iron from "~/images/resources/iron.webp";
import wood from "~/images/resources/wood.webp";
import clay from "~/images/resources/clay.webp";
import crop from "~/images/resources/crop.webp";
import telegramIcon from "~/images/social/telegram.webp";
import youtubeIcon from "~/images/social/youtube.webp";
import xIcon from "~/images/social/x.webp";

import { useGameStatus } from "@/context";
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

/**
 * Embers drifting up from the fires below, drawn on a canvas: each rises at
 * its own pace with a lazy sway, flickers, glows, and burns out on the way
 * up. A few near ones are bigger, softer and faster (depth); now and then a
 * quick spark shoots up. They're born all over the bottom of the screen at
 * once, so there's never a row of them waiting at the edge. Stops when the
 * tab is hidden; not drawn at all for players who ask for less motion.
 */
const Embers = () => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext("2d");

    if (!canvas || !g || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    type Ember = { x: number; y: number; vy: number; sway: number; phase: number; r: number; life: number; age: number; hue: number; near: boolean };
    let w = 0;
    let h = 0;
    let dpr = 1;
    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    const spawn = (anywhere: boolean): Ember => {
      const near = Math.random() < 0.15;
      const spark = !near && Math.random() < 0.12;
      const life = (spark ? 2 : 5 + Math.random() * 5) * (near ? 0.8 : 1);

      return {
        x: Math.random() * w,
        // At the start, some are already on their way up so there's no wait.
        y: anywhere ? h * (0.35 + Math.random() * 0.75) : h + 10,
        vy: (spark ? 220 : near ? 95 : 40 + Math.random() * 50) * (0.8 + Math.random() * 0.4),
        sway: 8 + Math.random() * 22,
        phase: Math.random() * Math.PI * 2,
        r: near ? 2.6 + Math.random() * 2 : spark ? 1.1 : 0.9 + Math.random() * 1.6,
        life,
        age: anywhere ? Math.random() * life * 0.7 : 0,
        hue: 18 + Math.random() * 22,
        near,
      };
    };

    size();
    const embers = Array.from({ length: 60 }, () => spawn(true));
    let last = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);

      last = t;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];

        e.age += dt;
        e.y -= e.vy * dt;
        if (e.age >= e.life || e.y < -10) {
          embers[i] = spawn(false);
          continue;
        }
        const k = e.age / e.life;
        // Fade in fast, burn out slowly, flicker all along.
        const glow = Math.min(1, k * 8) * (1 - k) ** 1.1 * (0.7 + 0.3 * Math.sin(t / 90 + e.phase * 7));
        const x = e.x + Math.sin(t / 1400 + e.phase) * e.sway * k;
        const r = e.r * (1 - k * 0.5);
        const halo = g.createRadialGradient(x, e.y, 0, x, e.y, r * (e.near ? 5 : 4));

        halo.addColorStop(0, `hsla(${e.hue + 15}, 100%, 75%, ${glow})`);
        halo.addColorStop(0.25, `hsla(${e.hue}, 100%, 55%, ${glow * 0.55})`);
        halo.addColorStop(1, `hsla(${e.hue - 8}, 100%, 40%, 0)`);
        g.fillStyle = halo;
        g.beginPath();
        g.arc(x, e.y, r * (e.near ? 5 : 4), 0, Math.PI * 2);
        g.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };

    start();
    window.addEventListener("resize", size);
    document.addEventListener("visibilitychange", start);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      document.removeEventListener("visibilitychange", start);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 w-full h-full pointer-events-none" />;
};

/**
 * The first thing players see. Progress follows real work: art downloading,
 * then signing in and loading the tribe. Calls onDone once ready.
 */
export const LoadingScreen = ({ onDone }: { onDone?: () => void }) => {
  const { status, error, retry } = useGameStatus();
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
        className="absolute inset-0 w-full h-full object-cover object-[50%_30%] motion-safe:animate-kenburns"
        placeholder="blur"
        src={bg}
      />
      {/* Keep the painting vivid: darken only behind the title and the loading bar. */}
      <div className="absolute inset-x-0 top-0 h-[34%] bg-gradient-to-b from-ground/85 via-ground/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-ground via-ground/80 to-transparent" />
      {/* Lightning flicker in the storm. */}
      <div className="absolute inset-0 bg-[#BFE8FF] mix-blend-overlay pointer-events-none motion-safe:animate-[lightning_7s_ease-in-out_infinite] opacity-0" />

      {/* Firelight from below, breathing gently, and the embers it throws up. */}
      <div className="absolute inset-x-0 bottom-0 h-[30%] pointer-events-none bg-[radial-gradient(ellipse_at_50%_115%,rgba(232,97,44,0.38),transparent_65%)] motion-safe:animate-[firelight_3.2s_ease-in-out_infinite]" />
      <Embers />

      <div className="relative h-full flex flex-col items-center px-8 pt-[7svh] pb-8">
        <h1 className="font-display font-black text-[46px] leading-none tracking-[0.06em] text-transparent bg-clip-text bg-gradient-to-b from-[#FBE3A6] via-goldtext to-gold drop-shadow-[0_3px_6px_rgba(0,0,0,0.9)]">
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
              className="btn btn-gold btn-lg px-8"
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
                className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-gold via-goldtext to-ember transition-[width] duration-500 ease-out shadow-[0_0_10px_rgba(232,97,44,0.6)]"
                style={{ width: `${progress}%` }}
              >
                {/* A glint running along the bar while it fills. */}
                <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/45 to-transparent motion-safe:animate-[glint_1.8s_ease-in-out_infinite]" />
              </div>
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
              <p
                key={tip}
                className={clsx("text-[13px] text-sub text-center leading-snug min-h-[36px] max-w-[300px] motion-safe:animate-[tipIn_400ms_ease-out]")}
              >
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
