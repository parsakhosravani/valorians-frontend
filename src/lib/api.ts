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
export function resolveAuthHeader(): string | null {
  if (typeof window === "undefined") return null;
  const initData: string | undefined = (window as any).Telegram?.WebApp?.initData;
  if (initData) return `tma ${initData}`;

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
