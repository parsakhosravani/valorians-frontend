"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

import { pageBack } from "./pageBack";

/**
 * Telegram's back button (and Android's back gesture, which Telegram turns
 * into the same event), run from one place.
 *
 * It used to be shown by some pages and hidden by others, each adding its own
 * click handler while it was on screen. Going from a page that showed it to
 * one that did neither (Build, War, Quest) left the button up with no handler
 * behind it, so tapping it did nothing. Now:
 *
 * - Anything open over the page (a drawer, a sheet) registers with
 *   useBackHandler while it's open; back closes the one opened last.
 * - Otherwise the page decides: the Hall is home, with no back button (Telegram
 *   shows its close button there); the other tabs go back to the Hall; pages
 *   opened from somewhere (leaderboard, market, quests) go back to where you
 *   were, or the Hall if you came straight in.
 */

type Entry = { run: () => void };

// What's open over the page, oldest first. Kept outside React so any
// component can add to it and the one button sees them all.
const open: Entry[] = [];
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);

  return () => listeners.delete(l);
};
const openCount = () => open.length;

/** While `active`, Telegram's back button runs `onBack` (for a drawer: closes it) before anything else. */
export function useBackHandler(active: boolean, onBack: () => void) {
  const latest = useRef(onBack);

  useEffect(() => {
    latest.current = onBack;
  });

  useEffect(() => {
    if (!active) return;
    const entry: Entry = { run: () => latest.current() };

    open.push(entry);
    changed();

    return () => {
      const i = open.indexOf(entry);

      if (i >= 0) open.splice(i, 1);
      changed();
    };
  }, [active]);
}

/** Wires Telegram's back button for the whole app. Call once, where `telegram` is known. */
export function useTelegramBackButton(telegram: { WebApp?: TelegramWebApp } | undefined) {
  const pathname = usePathname();
  const router = useRouter();
  const overlays = useSyncExternalStore(subscribe, openCount, () => 0);
  // Pages visited in this session: going back makes sense only if we came from one.
  const visited = useRef(0);
  const action = useRef<() => void>(() => undefined);

  useEffect(() => {
    visited.current++;
  }, [pathname]);

  const home = pageBack(pathname, 2) === "none";

  useEffect(() => {
    action.current = () => {
      const top = open[open.length - 1];

      const page = pageBack(pathname, visited.current);

      if (top) top.run();
      else if (page === "hall") router.push("/hall");
      else if (page === "back") router.back();
    };
  });

  // One click handler for the app's whole life.
  useEffect(() => {
    const app = telegram?.WebApp;

    if (!app) return;
    const onBack = () => action.current();

    app.onEvent("backButtonClicked", onBack);

    return () => app.offEvent("backButtonClicked", onBack);
  }, [telegram]);

  // Shown whenever back can do something.
  useEffect(() => {
    const button = telegram?.WebApp?.BackButton;

    if (!button) return;
    if (overlays > 0 || !home) button.show();
    else button.hide();
  }, [telegram, overlays, home]);
}

type TelegramWebApp = {
  BackButton: { show: () => void; hide: () => void };
  onEvent: (event: "backButtonClicked", cb: () => void) => void;
  offEvent: (event: "backButtonClicked", cb: () => void) => void;
};
