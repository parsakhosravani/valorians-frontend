"use client";

import type { PlayerView } from "@/server/players";

export type { PlayerView };

export type Friend = {
  id: number;
  name: string;
  username: string | null;
  photoUrl: string | null;
  isPremium: boolean;
  population: number;
  bonusCoins: number;
  bonusPopulation: number;
  joinedAt: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number
  ) {
    super(message);
  }
}

const DEV_ID_KEY = "valorians:dev-user-id";

/**
 * Works out how this client signs in:
 * - inside Telegram: the signed launch data (`tma …`)
 * - in a normal browser with NEXT_PUBLIC_DEV_LOGIN=true: a local test player
 * - otherwise null (the app shows "play on mobile")
 */
/**
 * Telegram's signed launch data. The SDK usually exposes it as
 * Telegram.WebApp.initData, but Telegram Desktop can hand it over only in the
 * URL hash (#tgWebAppData=…) or, after a reload/navigation, in sessionStorage.
 */
export function telegramInitData(): string | null {
  if (typeof window === "undefined") return null;
  const fromSdk: string | undefined = (window as any).Telegram?.WebApp?.initData;
  if (fromSdk) return fromSdk;

  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppData");
  if (fromHash) return fromHash;

  try {
    const saved = JSON.parse(sessionStorage.getItem("__telegram__initParams") || "null");
    if (saved?.tgWebAppData) return saved.tgWebAppData as string;
  } catch {}
  return null;
}

/** True when the page runs inside any Telegram client (phone, desktop or web). */
export const insideTelegram = () =>
  typeof window !== "undefined" &&
  (!!(window as any).TelegramWebviewProxy ||
    !!(window as any).Telegram?.WebApp?.platform && (window as any).Telegram.WebApp.platform !== "unknown" ||
    window.location.hash.includes("tgWebAppData") ||
    window.parent !== window);

export function resolveAuthHeader(): string | null {
  if (typeof window === "undefined") return null;
  const initData = telegramInitData();
  if (initData) {
    try {
      // Keep it for this tab so later navigations still have it.
      sessionStorage.setItem("valorians:init-data", initData);
    } catch {}
    return `tma ${initData}`;
  }
  try {
    const kept = sessionStorage.getItem("valorians:init-data");
    if (kept) return `tma ${kept}`;
  } catch {}

  if (process.env.NEXT_PUBLIC_DEV_LOGIN === "true") {
    const url = new URL(window.location.href);
    let id = url.searchParams.get("dev_user");
    try {
      id = id ?? localStorage.getItem(DEV_ID_KEY);
      if (!id) id = String(Math.floor(Math.random() * 1e9) + 1);
      localStorage.setItem(DEV_ID_KEY, id);
    } catch {
      id = id ?? "1";
    }
    const startParam = url.searchParams.get("startapp");
    return `dev ${id}${startParam ? `:${startParam}` : ""}`;
  }
  return null;
}

export async function apiRequest<T = PlayerView>(
  auth: string,
  path: string,
  body?: object
): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: auth,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error ?? "Network error", data.code ?? "network", res.status);
  }
  return data as T;
}
