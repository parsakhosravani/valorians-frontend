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
import { IconText } from "@/components/atoms/GameIcon";
import { StaticImageData } from "next/image";

import iron from "~/images/resources/iron.webp";
import wood from "~/images/resources/wood.webp";
import clay from "~/images/resources/clay.webp";
import crop from "~/images/resources/crop.webp";
import ironRock from "~/images/resources/rock-iron.webp";
import woodRock from "~/images/resources/rock-wood.webp";
import clayRock from "~/images/resources/rock-clay.webp";
import cropRock from "~/images/resources/rock-crop.webp";
import ironBg from "~/images/background/iron.webp";
import woodBg from "~/images/background/wood.webp";
import clayBg from "~/images/background/clay.webp";
import cropBg from "~/images/background/crop.webp";

import { ApiError, PlayerView, apiRequest, insideTelegram, resolveAuthHeader } from "@/lib/api";
import type { Offer } from "@/lib/game/trade";
import type { ClanFlag, JoinMode, TechId, TreasuryKey } from "@/lib/game/clan";
import {
  COMBO_WINDOW_MS,
  RESOURCE_IDS,
  RESOURCE_NAMES,
  ResourceId,
  QuestId,
  ShieldId,
  UnitId,
  comboMultiplier,
} from "@/lib/game/config";
import type { RaidReport } from "@/lib/game/war";
import {
  Army,
  GameState,
  Rates,
  SkillId,
  advance,
  applyTaps,
  frenzyActive,
  TapBatch,
  getRates,
} from "@/lib/game/engine";

export type TResource = {
  id: ResourceId;
  name: string;
  img: StaticImageData;
  bg: StaticImageData;
  /** Large art the player strikes in the Daily Mine. */
  rock: StaticImageData;
};

export const RESOURCES: TResource[] = [
  { id: "iron", name: RESOURCE_NAMES.iron, img: iron, bg: ironBg, rock: ironRock },
  { id: "wood", name: RESOURCE_NAMES.wood, img: wood, bg: woodBg, rock: woodRock },
  { id: "clay", name: RESOURCE_NAMES.clay, img: clay, bg: clayBg, rock: clayRock },
  { id: "crop", name: RESOURCE_NAMES.crop, img: crop, bg: cropBg, rock: cropRock },
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
  /** Registers one tap (crit = hit the weak spot); returns how much was gained (0 if blocked). */
  tap: (resource: ResourceId, crit?: boolean) => number;
  /** Current combo count and multiplier (resets after a pause). */
  combo: { count: number; multiplier: number };
  claimStreak: () => Promise<boolean>;
  upgradeSkill: (skill: SkillId) => Promise<boolean>;
  upgradeBuilding: (id: string) => Promise<boolean>;
  startQuest: (id: QuestId) => Promise<boolean>;
  claimQuest: (id: QuestId) => Promise<boolean>;
  train: (unit: UnitId, count: number) => Promise<boolean>;
  /** Cancels the training batch with this startsAt; unfinished units are refunded. */
  cancelTraining: (startsAt: number) => Promise<boolean>;
  /** Attack a player (target = id) or a barbarian camp (camp = level). */
  /** Sends an army across the map; resolves to its arrival time, or null if it couldn't leave. */
  attack: (to: { target?: number; camp?: number }, units: Army) => Promise<{ id: number; arrivesAt: number } | null>;
  recall: (marchId: number) => Promise<boolean>;
  /**
   * New orders for an army on the road (marching out: `attack`; walking home:
   * `march`): it goes on to another target with `units` (at most what it has).
   */
  redirect: (
    from: { attack?: number; march?: string },
    to: { target?: number; camp?: number },
    units: Army
  ) => Promise<{ id: number; arrivesAt: number } | null>;
  /** Raises the War Orders card a level (one more new order per expedition). */
  buyOrdersCard: () => Promise<boolean>;
  /** Quietly reloads the player's state (e.g. after a battle was fought on the server). */
  refresh: () => Promise<void>;
  scout: (target: number) => Promise<ScoutReport | null>;
  /** Marketplace: post an offer, buy one, or take yours back. */
  trade: {
    post: (o: Offer) => Promise<boolean>;
    accept: (id: number) => Promise<boolean>;
    cancel: (id: number) => Promise<boolean>;
  };
  /** Clans: membership, ranks, the flag, the treasury and clan techs. */
  clan: {
    create: (c: { name: string; tag: string; description?: string; flag: ClanFlag; joinMode: JoinMode }) => Promise<boolean>;
    /** Joins an open clan or asks to join one that takes requests. */
    join: (id: number) => Promise<boolean>;
    cancelRequest: (id: number) => Promise<boolean>;
    answer: (id: number, accept: boolean) => Promise<boolean>;
    leave: () => Promise<boolean>;
    kick: (id: number) => Promise<boolean>;
    setRole: (id: number, role: "officer" | "member") => Promise<boolean>;
    transfer: (id: number) => Promise<boolean>;
    update: (
      c: Partial<{ flag: ClanFlag; description: string; name: string; joinMode: JoinMode; minPopulation: number }>,
      success?: string
    ) => Promise<boolean>;
    donate: (key: TreasuryKey, amount: number) => Promise<boolean>;
    upgradeTech: (tech: TechId) => Promise<boolean>;
    aid: (id: number, key: TreasuryKey, amount: number) => Promise<boolean>;
  };
  /** Valorians Plus: the one free trial, or a monthly Telegram Stars subscription. */
  plus: {
    trial: () => Promise<boolean>;
    /** Opens Telegram's payment sheet; resolves true once the payment went through. */
    subscribe: () => Promise<boolean>;
  };
  /** Shields: bought with Telegram Stars, or the free weekly one that comes with Plus. */
  shields: {
    /** Opens Telegram's payment sheet; resolves true once the shield is up. */
    buy: (id: ShieldId) => Promise<boolean>;
    claimPlus: () => Promise<boolean>;
  };
  authHeader: string | null;
}

export type BattleReport = RaidReport & { attackerName: string; defenderName: string };

export type ScoutReport = {
  id: number;
  name: string;
  at: number;
  cost: number;
  terrain: string;
  defense: number;
  troops: Record<string, number>;
  loot: Record<string, number>;
  shieldUntil: number;
  power: number;
};

const GameContext = createContext<GameContextType | undefined>(undefined);

const FLUSH_DELAY_MS = 700;
const RESYNC_MS = 60_000;

type Pending = Record<ResourceId, Required<TapBatch>>;
const emptyBatch = (): Required<TapBatch> => ({ taps: 0, crits: 0, comboSum: 0, frenzyTaps: 0 });
const noPending = (): Pending => ({ iron: emptyBatch(), wood: emptyBatch(), clay: emptyBatch(), crop: emptyBatch() });

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
      if (pendingRef.current[id].taps > 0) {
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
    if (RESOURCE_IDS.every((id) => batch[id].taps === 0)) return;
    pendingRef.current = noPending();

    const run = (async () => {
      let last: PlayerView | null = null;
      for (const id of RESOURCE_IDS) {
        if (!batch[id].taps) continue;
        try {
          last = await apiRequest(auth, "tap", { resource: id, ...batch[id] });
        } catch (e) {
          if (!(e instanceof ApiError)) {
            // Network hiccup: keep the taps and try again later.
            const p = pendingRef.current[id];

            p.taps += batch[id].taps;
            p.crits += batch[id].crits;
            p.comboSum += batch[id].comboSum;
            p.frenzyTaps += batch[id].frenzyTaps;
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
    let auth = resolveAuthHeader();
    // Telegram Desktop can hand over the launch data a moment after the page
    // starts; wait up to ~3s inside Telegram before giving up.
    for (let i = 0; !auth && insideTelegram() && i < 15; i++) {
      await new Promise((r) => setTimeout(r, 200));
      auth = resolveAuthHeader();
    }
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

  const comboRef = useRef({ count: 0, last: 0 });
  const [combo, setCombo] = useState({ count: 0, multiplier: 1 });

  // The combo breaks if you pause too long.
  useEffect(() => {
    if (!combo.count) return;
    const t = setTimeout(() => {
      if (Date.now() - comboRef.current.last >= COMBO_WINDOW_MS) {
        comboRef.current.count = 0;
        setCombo({ count: 0, multiplier: 1 });
      }
    }, COMBO_WINDOW_MS + 50);

    return () => clearTimeout(t);
  }, [combo.count]);

  const tap = useCallback(
    (resource: ResourceId, crit = false) => {
      const cur = baseRef.current;
      if (!cur) return 0;
      const t = serverNow();
      const c = comboRef.current;
      const nowMs = Date.now();
      const count = nowMs - c.last <= COMBO_WINDOW_MS ? c.count + 1 : 1;
      const multiplier = comboMultiplier(count);
      const advanced = advance(cur, t);
      const one: Required<TapBatch> = {
        taps: 1,
        crits: crit ? 1 : 0,
        comboSum: multiplier,
        frenzyTaps: frenzyActive(advanced, t) ? 1 : 0,
      };
      const res = applyTaps(advanced, resource, one, t, { rateLimit: false });
      if (!res.accepted) return 0;

      comboRef.current = { count, last: nowMs };
      setCombo({ count, multiplier });
      const p = pendingRef.current[resource];

      p.taps += 1;
      p.crits += one.crits;
      p.comboSum += one.comboSum;
      p.frenzyTaps += one.frenzyTaps;
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
          toast.success(<IconText text={success} />);
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

  /**
   * Telegram Stars checkout: gets an invoice link from `endpoint`, opens the
   * payment sheet, then waits for the bot to record the payment (Telegram
   * tells the server a moment after the sheet closes) until `done` is true.
   */
  const payWithStars = async (endpoint: string, body: object, success: string, done: (res: PlayerView) => boolean) => {
    if (!authHeader) return false;
    const webApp = (window as any).Telegram?.WebApp;

    if (!webApp?.openInvoice) {
      showError(new Error("Open the game inside Telegram to pay with Stars"));

      return false;
    }
    let link: string;

    try {
      link = (await apiRequest<{ link: string }>(authHeader, endpoint, body)).link;
    } catch (e) {
      showError(e);

      return false;
    }
    const status = await new Promise<string>((resolve) => webApp.openInvoice(link, resolve));

    if (status === "failed") showError(new Error("The payment didn't go through"));
    if (status !== "paid") return false;
    webApp.HapticFeedback?.notificationOccurred("success");
    toast.dismiss();
    toast.success(<IconText text={success} />);
    for (let i = 0; i < 10; i++) {
      try {
        const res = await apiRequest<PlayerView>(authHeader, "me");

        accept(res);
        if (done(res)) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 1500));
    }

    return true;
  };

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
    claimStreak: () => act("streak", {}, "Reward claimed!"),
    combo,
    upgradeBuilding: (building) => act("buildings/upgrade", { building }, "Construction started"),
    startQuest: (quest) => act("quests/start", { quest }),
    claimQuest: (quest) => act("quests/claim", { quest }, "Reward claimed!"),
    train: (unit, count) => act("war/train", { unit, count }, "Training started"),
    cancelTraining: (startsAt) => act("war/train/cancel", { startsAt }, "Training cancelled, resources refunded"),
    attack: async (to, units) => {
      const res = await send<PlayerView & { march: { id: number; arrivesAt: number } }>("war/march", { ...to, units }, "Army on the march");

      return res?.march ?? null;
    },
    recall: (id) => act("war/recall", { id }, "Army turned back"),
    redirect: async (from, to, units) => {
      const res = await send<PlayerView & { march: { id: number; arrivesAt: number } }>(
        "war/redirect",
        { ...from, ...to, units },
        "New orders sent"
      );

      return res?.march ?? null;
    },
    buyOrdersCard: () => act("war/orders", {}, "War Orders card upgraded"),
    refresh: async () => {
      if (!authHeader) return;
      try {
        await flush();
        accept(await apiRequest<PlayerView>(authHeader, "me"));
      } catch {
        // A missed refresh is fine; the next action brings the state up to date.
      }
    },
    scout: async (target) => {
      const res = await send<PlayerView & { scout: ScoutReport }>("war/scout", { target });

      return res?.scout ?? null;
    },
    trade: {
      post: (o) => act("trade/offer", o, "Offer posted on the market"),
      accept: (id) => act("trade/accept", { id }, "Deal! Merchants are on their way"),
      cancel: (id) => act("trade/cancel", { id }, "Offer cancelled, goods returned"),
    },
    clan: {
      create: (c) => act("clan/create", c, "Clan founded!"),
      join: async (id) => {
        const res = await send<PlayerView & { joined: boolean }>("clan/join", { id });

        if (res) {
          toast.dismiss();
          toast.success(res.joined ? "Welcome to the clan!" : "Request sent. The clan's officers will decide.");
        }

        return !!res;
      },
      cancelRequest: (id) => act("clan/cancel", { id }, "Request withdrawn"),
      answer: (id, accept) => act("clan/answer", { id, accept }, accept ? "Welcome aboard!" : "Request declined"),
      leave: () => act("clan/leave", {}, "You left the clan"),
      kick: (id) => act("clan/kick", { id }, "Member removed"),
      setRole: (id, role) => act("clan/role", { id, role }, role === "officer" ? "Named a Huscarl" : "Rank removed"),
      transfer: (id) => act("clan/transfer", { id }, "The clan has a new Jarl"),
      update: (c, success = "Clan updated") => act("clan/update", c, success),
      donate: (key, amount) => act("clan/donate", { key, amount }, "Donated to the treasury"),
      upgradeTech: (tech) => act("clan/tech", { tech }, "Clan tech raised!"),
      aid: (id, key, amount) => act("clan/aid", { id, key, amount }, "Aid sent"),
    },
    plus: {
      trial: () => act("plus/trial", {}, "👑 Plus is on! Enjoy your free days"),
      subscribe: () =>
        payWithStars("plus/invoice", {}, "👑 Welcome to Valorians Plus!", (res) => res.state.plus.until > res.serverTime),
    },
    shields: {
      buy: (id) => {
        // A raised shield always moves the cooldown forward, so that's the sign it landed.
        const before = baseRef.current?.shield?.cooldownUntil ?? 0;

        return payWithStars("shield/invoice", { shield: id }, "🛡️ Shield raised!", (res) => res.state.shield.cooldownUntil > before);
      },
      claimPlus: () => act("shield/plus", {}, "🛡️ Weekly shield raised!"),
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
