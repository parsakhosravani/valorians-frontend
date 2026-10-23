"use client";
import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import { StaticImageData } from "next/image";

import iron from "~/images/resources/iron.webp";
import wood from "~/images/resources/wood.webp";
import clay from "~/images/resources/clay.webp";
import crop from "~/images/resources/crop.webp";
import ironBg from "~/images/background/iron.webp";
import woodBg from "~/images/background/wood.webp";
import clayBg from "~/images/background/clay.webp";
import cropBg from "~/images/background/crop.webp";

import { ApiError, PlayerView, apiRequest, resolveAuthHeader } from "@/lib/api";
import { RESOURCE_IDS, RESOURCE_NAMES, ResourceId, QuestId, UnitId } from "@/lib/game/config";
import type { RaidReport } from "@/lib/game/war";
import {
  Army,
  GameState,
  Rates,
  SkillId,
  advance,
  applyTaps,
  getRates,
} from "@/lib/game/engine";

export type TResource = {
  id: ResourceId;
  name: string;
  img: StaticImageData;
  bg: StaticImageData;
};

export const RESOURCES: TResource[] = [
  { id: "iron", name: RESOURCE_NAMES.iron, img: iron, bg: ironBg },
  { id: "wood", name: RESOURCE_NAMES.wood, img: wood, bg: woodBg },
  { id: "clay", name: RESOURCE_NAMES.clay, img: clay, bg: clayBg },
  { id: "crop", name: RESOURCE_NAMES.crop, img: crop, bg: cropBg },
];

export type GameStatus = "loading" | "ready" | "error" | "no-auth";

interface GameContextType {
  status: GameStatus;
  error: string | null;
  retry: () => void;
  me: PlayerView["me"] | null;
  /** Live state, projected to the current second. */
  state: GameState | null;
  rates: Rates | null;
  /** Current time on the server's clock (ms). */
  now: number;
  activeResource: TResource;
  setActiveResource: (r: TResource) => void;
  /** Registers one tap; returns how much was gained (0 if blocked). */
  tap: (resource: ResourceId) => number;
  upgradeSkill: (skill: SkillId) => Promise<boolean>;
  refillEnergy: () => Promise<boolean>;
  upgradeBuilding: (id: string) => Promise<boolean>;
  startQuest: (id: QuestId) => Promise<boolean>;
  claimQuest: (id: QuestId) => Promise<boolean>;
  train: (unit: UnitId, count: number) => Promise<boolean>;
  /** Attack a player (target = id) or a barbarian camp (camp = level). */
  attack: (to: { target?: number; camp?: number }, units: Army) => Promise<BattleReport | null>;
  authHeader: string | null;
}

export type BattleReport = RaidReport & { attackerName: string; defenderName: string };

const GameContext = createContext<GameContextType | undefined>(undefined);

const FLUSH_DELAY_MS = 700;
const RESYNC_MS = 60_000;

type Pending = Record<ResourceId, number>;
const noPending = (): Pending => ({ iron: 0, wood: 0, clay: 0, crop: 0 });

export const ResourceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<GameStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<PlayerView["me"] | null>(null);
  const [base, setBase] = useState<GameState | null>(null);
  const [activeResource, setActiveResource] = useState<TResource>(RESOURCES[0]);
  const [tick, setTick] = useState(0);
  const [authHeader, setAuthHeader] = useState<string | null>(null);

  // Refs mirror state so tap handlers can run many times per render.
  const baseRef = useRef<GameState | null>(null);
  const offsetRef = useRef(0); // serverTime - Date.now()
  const pendingRef = useRef<Pending>(noPending());
  const inFlightRef = useRef<Promise<void> | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const serverNow = () => Date.now() + offsetRef.current;

  const setBoth = (s: GameState) => {
    baseRef.current = s;
    setBase(s);
  };

  /** Applies a fresh server view, re-applying taps the server hasn't seen yet. */
  const accept = useCallback((view: PlayerView) => {
    offsetRef.current = view.serverTime - Date.now();
    setMe(view.me);
    let s = view.state;
    const t = serverNow();
    for (const id of RESOURCE_IDS) {
      if (pendingRef.current[id] > 0) {
        s = applyTaps(advance(s, t), id, pendingRef.current[id], t, { rateLimit: false }).state;
      }
    }
    setBoth(s);
  }, []);

  const showError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : "Something went wrong";
    toast.dismiss();
    toast.error(msg);
  };

  const flush = useCallback(async (): Promise<void> => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    if (inFlightRef.current) await inFlightRef.current;
    const auth = authHeader;
    if (!auth) return;

    const batch = pendingRef.current;
    if (RESOURCE_IDS.every((id) => batch[id] === 0)) return;
    pendingRef.current = noPending();

    const run = (async () => {
      let last: PlayerView | null = null;
      for (const id of RESOURCE_IDS) {
        if (!batch[id]) continue;
        try {
          last = await apiRequest(auth, "tap", { resource: id, taps: batch[id] });
        } catch (e) {
          if (!(e instanceof ApiError)) {
            // Network hiccup: keep the taps and try again later.
            pendingRef.current[id] += batch[id];
          }
        }
      }
      if (last) accept(last);
    })();
    inFlightRef.current = run;
    await run;
    inFlightRef.current = null;
  }, [authHeader, accept]);

  const load = useCallback(async () => {
    const auth = resolveAuthHeader();
    setAuthHeader(auth);
    if (!auth) {
      setStatus("no-auth");
      return;
    }
    setStatus((s) => (s === "ready" ? s : "loading"));
    try {
      accept(await apiRequest(auth, "me"));
      setStatus("ready");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server");
      setStatus((s) => (s === "ready" ? s : "error"));
    }
  }, [accept]);

  useEffect(() => {
    // Telegram's script loads before hydration, but give it a tick to be safe.
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Redraw counters every second, resync periodically, flush when hidden.
  useEffect(() => {
    if (status !== "ready") return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    const r = setInterval(() => {
      flush().then(load);
    }, RESYNC_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
      else load();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(t);
      clearInterval(r);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [status, flush, load]);

  const tap = useCallback(
    (resource: ResourceId) => {
      const cur = baseRef.current;
      if (!cur) return 0;
      const t = serverNow();
      const res = applyTaps(advance(cur, t), resource, 1, t, { rateLimit: false });
      if (!res.accepted) return 0;
      pendingRef.current[resource] += 1;
      setBoth(res.state);
      if (!flushTimer.current) {
        flushTimer.current = setTimeout(() => {
          flushTimer.current = null;
          flush();
        }, FLUSH_DELAY_MS);
      }
      return res.gained;
    },
    [flush]
  );

  const send = useCallback(
    async <T extends PlayerView>(path: string, body: object, success?: string): Promise<T | null> => {
      if (!authHeader) return null;
      try {
        await flush();
        const res = await apiRequest<T>(authHeader, path, body);

        accept(res);
        if (success) {
          toast.dismiss();
          toast.success(success);
        }

        return res;
      } catch (e) {
        showError(e);

        return null;
      }
    },
    [authHeader, flush, accept]
  );
  const act = async (path: string, body: object, success?: string) => !!(await send(path, body, success));

  const now = serverNow();
  const state = useMemo(() => (base ? advance(base, now) : null), [base, tick]);
  const rates = useMemo(() => (state ? getRates(state) : null), [state]);

  const value: GameContextType = {
    status,
    error,
    retry: load,
    me,
    state,
    rates,
    now,
    activeResource,
    setActiveResource,
    tap,
    upgradeSkill: (skill) => act("skills/upgrade", { skill }, "Upgraded!"),
    refillEnergy: () => act("skills/full-energy", {}, "Energy refilled"),
    upgradeBuilding: (building) => act("buildings/upgrade", { building }, "Construction started"),
    startQuest: (quest) => act("quests/start", { quest }),
    claimQuest: (quest) => act("quests/claim", { quest }, "Reward claimed!"),
    train: (unit, count) => act("war/train", { unit, count }, "Training started"),
    attack: async (to, units) => {
      const res = await send<PlayerView & { report: BattleReport }>(
        to.camp ? "war/camp" : "war/raid",
        to.camp ? { level: to.camp, units } : { target: to.target, units }
      );

      return res?.report ?? null;
    },
    authHeader,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

export const useResourceContext = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error("useResourceContext must be used within a ResourceProvider");
  }
  return context;
};

/** Same as useResourceContext, for components that only render once ready. */
export const useGame = () => {
  const ctx = useResourceContext();
  return ctx as GameContextType & { state: GameState; rates: Rates; me: PlayerView["me"] };
};
