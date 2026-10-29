"use client";
import { useLive } from "@/context";
import { formatDuration } from "@/lib/format";

/**
 * Time left until `to` ("4m 57s"), ticking every second on its own: the
 * screen around it doesn't have to redraw every second to keep it current.
 */
export const Countdown = ({ to }: { to: number }) => {
  const now = useLive((l) => l.now);

  return <>{formatDuration(to - now)}</>;
};

/** Time since `at` ("2m 10s"), ticking on its own like Countdown. */
export const Since = ({ at }: { at: number }) => {
  const now = useLive((l) => l.now);

  return <>{formatDuration(now - at)}</>;
};
