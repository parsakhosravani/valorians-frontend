"use client";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import clsx from "clsx";

import {
  ArmyToken,
  CaravanToken,
  ROUTE_COLORS,
  Road,
  Route,
  progress,
} from "./MapTravellers";
import { AttackTarget } from "./SendArmyDrawer";
import { ArmyOnRoad, ArmyOrdersDrawer, RedirectDrawer, armySpot } from "./RedirectDrawer";
import {
  BattleMovement,
  BattleRow,
  BattleToken,
  LiveBattleData,
  LiveBattleDrawer,
} from "./LiveBattle";
import { ArmyLine, UnitEmoji, fmt } from "./shared";

import { Button, Drawer, InfoDrawer } from "@/components";
import {
  BattleReport,
  ScoutReport,
  useGame,
  useTelegramContext,
} from "@/context";
import { apiRequest } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import {
  BUILDING_BY_ID,
  RESOURCE_NAMES,
  ResourceId,
  UnitId,
  buildingImage,
} from "@/lib/game/config";
import {
  TERRAIN,
  Terrain,
  marchRoute,
  pointAlong,
  routeMs,
  routeTimeline,
  scoutCost,
  seaRoute,
  terrainAt,
} from "@/lib/game/map";
import { landingFactorFor } from "@/lib/game/war";
import type { Army } from "@/lib/game/engine";
import type { ClanFlag as ClanFlagData } from "@/lib/game/clan";
import { ClanFlag } from "@/components/molecules/ClanFlag";
import { GameIcon, IconText } from "@/components/atoms/GameIcon";

// ─── Data from /api/war/map ──────────────────────────────────────────────────

type Tribe = {
  id: number;
  name: string;
  photoUrl: string | null;
  x: number;
  y: number;
  isMe: boolean;
  population: number;
  power: number;
  townHall: number;
  /** On the sea's edge (older servers don't send it). */
  coastal?: boolean;
  harbor?: number;
  shieldUntil: number;
  terrain: Terrain;
  distance: number;
  defense: { min: number; max: number; exact: boolean } | null;
  clan: { id: number; tag: string; flag: ClanFlagData } | null;
  /** In your clan: can't be attacked. */
  ally: boolean;
};

type Camp = {
  level: number;
  x: number;
  y: number;
  state: "locked" | "new" | "ready" | "cooldown";
  readyAt: number;
  defense: number;
  reward: { resources: number; coins: number; first: boolean };
  terrain: Terrain;
  distance: number;
};

type Movement = {
  id: number;
  kind: "outgoing" | "incoming";
  from: { x: number; y: number; name: string };
  to: { x: number; y: number; name: string };
  sentAt: number;
  arrivesAt: number;
  units: Army | null;
  campLevel: number | null;
  /** Arrived: the battle is being fought (older servers don't send it). */
  battle?: LiveBattleData | null;
  /** Your armies: spoils carried from an earlier battle and new orders taken (older servers don't send them). */
  loot?: Partial<Record<ResourceId, number>> | null;
  coins?: number;
  hops?: number;
};

type Caravan = {
  id: string;
  kind: "coming" | "going" | "other";
  from: { x: number; y: number; name: string };
  to: { x: number; y: number; name: string };
  resource: ResourceId;
  amount: number;
  sentAt: number;
  arrivesAt: number;
};

export type MapData = {
  home: { x: number; y: number };
  center: { x: number; y: number };
  radius: number;
  tribes: Tribe[];
  camps: Camp[];
  movements: Movement[];
  caravans?: Caravan[];
  myPower: number;
};

type Selected =
  { kind: "tribe"; tribe: Tribe } | { kind: "camp"; camp: Camp } | null;

type ReportItem = { attackId: number | null; report: BattleReport };

// ─── Drawing ─────────────────────────────────────────────────────────────────

const T = 46; // tile size in px at zoom 1
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.8;

/** Map radius (tiles) that fills this box even fully zoomed out. */
const wantedRadius = (el: HTMLElement | null) => {
  const side = el ? Math.max(el.clientWidth, el.clientHeight) : 0;

  return Math.min(30, Math.max(14, Math.ceil(side / (T * MIN_ZOOM) / 2) + 1));
};

const TERRAIN_FILL: Record<Terrain, string[]> = {
  plains: ["#5E6B37", "#627039", "#5A6734"],
  forest: ["#34492A", "#36502B", "#314527"],
  hills: ["#7B6848", "#81704E", "#76633F"],
  mountains: ["#4E4130", "#534633", "#4A3D2C"],
  lake: ["#2F5664", "#315A69", "#2D5260"],
  sea: ["#1E4258", "#20465D", "#1C3F54"],
};

const TERRAIN_ICON: Record<Terrain, string> = {
  plains: "🌾",
  forest: "🌲",
  hills: "⛰️",
  mountains: "⛰️",
  lake: "💧",
  sea: "🌊",
};

const SAND = "#C8B27A";

const Ground = memo(function Ground({
  ox,
  oy,
  n,
}: {
  ox: number;
  oy: number;
  n: number;
}) {
  const tiles = [];

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = ox + i;
      const y = oy + j;
      const t = terrainAt(x, y);
      const v = (((x * 7 + y * 13) % 3) + 3) % 3;
      const px = i * T;
      const py = j * T;

      tiles.push(
        <g key={`${x},${y}`}>
          <rect fill={TERRAIN_FILL[t][v]} height={T} width={T} x={px} y={py} />
          {t === "forest" && (
            <g fill="#22361C" opacity="0.9">
              <polygon
                points={`${px + 12},${py + 30} ${px + 18},${py + 14} ${px + 24},${py + 30}`}
              />
              <polygon
                points={`${px + 24},${py + 38} ${px + 31},${py + 20} ${px + 38},${py + 38}`}
              />
            </g>
          )}
          {t === "hills" && (
            <path
              d={`M${px + 8} ${py + 32} l8 -10 l6 6 l8 -12 l10 16`}
              fill="none"
              opacity="0.7"
              stroke="#5A4A30"
              strokeLinejoin="round"
              strokeWidth="2.5"
            />
          )}
          {t === "mountains" && (
            <path
              d={`M${px + 8} ${py + 32} l8 -10 l6 6 l8 -12 l10 16`}
              fill="none"
              opacity="0.85"
              stroke="#2E261B"
              strokeLinejoin="round"
              strokeWidth="2.5"
            />
          )}
          {t === "lake" && (
            <path
              d={`M${px + 8} ${py + 20} q5 -4 10 0 t10 0 M${px + 16} ${py + 30} q5 -4 10 0 t10 0`}
              fill="none"
              opacity="0.45"
              stroke="#BFE0E8"
              strokeWidth="1.5"
            />
          )}
          {t === "sea" && v === 0 && (
            <path
              d={`M${px + 6} ${py + 16} q6 -5 12 0 t12 0 M${px + 18} ${py + 32} q6 -5 12 0 t12 0`}
              fill="none"
              opacity="0.35"
              stroke="#9FD0E6"
              strokeWidth="1.5"
            />
          )}
        </g>,
      );
    }
  }

  return <>{tiles}</>;
});

// ─── The sea ─────────────────────────────────────────────────────────────────

/**
 * What the sea means for a fight: for your own coastal tribe, the beach is on
 * your side; for a target across the water, you need Longships and land
 * against that advantage.
 */
const SeaNote = ({
  coastal,
  camp,
  harbor = 0,
  myHarbor = 0,
  ships = 0,
}: {
  coastal?: boolean;
  camp?: boolean;
  harbor?: number;
  myHarbor?: number;
  ships?: number;
}) => {
  const bonus = Math.round((landingFactorFor(harbor) - 1) * 100);

  return (
    <div className="rounded-xl border border-sea/50 bg-[#14222A]/90 px-2.5 py-2 text-xs text-[#A9D3EA] flex flex-col gap-1">
      {coastal ? (
        <span>
          <GameIcon e="⚓" /> <b>Your shore is your wall.</b> Armies from across the sea must land on your beach and fight at{" "}
          <b>+{bonus}%</b> to your defense{harbor ? "" : ". A Harbor makes it stronger"}.
        </span>
      ) : (
        <>
          <span>
            <GameIcon e="🌊" /> <b>Across the sea.</b> Your army sails on Longships, one for every 20 foot soldiers
            {camp ? "." : <>, then lands on their beach: <b>+{bonus}%</b> to their defense.</>}
          </span>
          <span className="text-sea">
            {myHarbor === 0
              ? "Build a Harbor to make Longships."
              : <IconText text={`⛵ ${fmt(ships)} Longship${ships === 1 ? "" : "s"} at home.`} />}
          </span>
        </>
      )}
    </div>
  );
};

// ─── The map ─────────────────────────────────────────────────────────────────

export const WarMap = ({
  onAttack,
  onBattleDone,
  focusId,
}: {
  onAttack: (t: AttackTarget) => void;
  onBattleDone: (r: BattleReport) => void;
  focusId?: number;
}) => {
  const { state, rates, now, authHeader, recall, scout, refresh } = useGame();
  const { telegram } = useTelegramContext();
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const [scouts, setScouts] = useState<Record<number, ScoutReport>>({});
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState<number | null>(null);
  // New orders: the army tapped, the army waiting for a new target, and the target picked.
  const [ordersFor, setOrdersFor] = useState<ArmyOnRoad | null>(null);
  const [picking, setPicking] = useState<ArmyOnRoad | null>(null);
  const [redirecting, setRedirecting] = useState<{ army: ArmyOnRoad; target: AttackTarget } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const radius = useRef(0);
  const outgoing = useRef<Set<number>>(new Set());
  const centred = useRef(false);
  const goods = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!authHeader) return;
    try {
      const d = await apiRequest<MapData>(
        authHeader,
        `war/map?r=${(radius.current = Math.max(radius.current, wantedRadius(box.current)))}` +
          (focusId ? `&focus=${focusId}` : ""),
      );
      const ids = new Set(
        d.movements.filter((m) => m.kind === "outgoing").map((m) => m.id),
      );
      const finished = Array.from(outgoing.current).filter(
        (id) => !ids.has(id),
      );

      outgoing.current = ids;
      // Merchants got home with our goods: show the new stock.
      const coming = new Set(
        (d.caravans ?? []).filter((c) => c.kind === "coming").map((c) => c.id),
      );
      const delivered = Array.from(goods.current).some((id) => !coming.has(id));

      goods.current = coming;
      setData(d);
      if (delivered && !finished.length) refresh();
      setError(null);
      if (finished.length) {
        // A battle was fought: bring the tribe up to date and show the result.
        await refresh();
        const r = await apiRequest<{ reports: ReportItem[] }>(
          authHeader,
          "war/reports",
        ).catch(() => null);
        const hit = r?.reports.find(
          (x) => x.attackId != null && finished.includes(x.attackId),
        );

        if (hit) {
          telegram?.WebApp.HapticFeedback.notificationOccurred(
            hit.report.attackerWon ? "success" : "error",
          );
          onBattleDone(hit.report);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [authHeader, focusId, refresh, onBattleDone, telegram]);

  // Poll, and check again right after the next army arrives.
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);

    return () => clearInterval(t);
  }, [load]);
  // ...and when a battle's next round (or the battle) ends.
  const nextArrival = data
    ? [
        ...data.movements.flatMap((m) =>
          m.battle
            ? [m.battle.nextRoundAt ?? m.battle.endsAt, m.battle.endsAt]
            : [m.arrivesAt],
        ),
        ...(data.caravans ?? []).map((c) => c.arrivesAt),
      ].reduce((m, t) => (t > Date.now() ? Math.min(m, t) : m), Infinity)
    : Infinity;

  useEffect(() => {
    if (!Number.isFinite(nextArrival)) return;
    const wait = Math.max(500, nextArrival - Date.now() + 1500);
    const t = setTimeout(load, Math.min(wait, 2 ** 31 - 1));

    return () => clearTimeout(t);
  }, [nextArrival, load]);

  const n = data ? data.radius * 2 + 1 : 0;
  const ox = data ? data.center.x - data.radius : 0;
  const oy = data ? data.center.y - data.radius : 0;
  const px = (x: number) => (x - ox) * T + T / 2;
  const py = (y: number) => (y - oy) * T + T / 2;

  /**
   * The road an army takes on the map (around mountains, lakes, over the
   * sea), in px, timed for its troops, plus where it is `f` of the way in.
   */
  const roadOf = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    units: Army | null,
    f: number,
  ): { road: Road; atSea: boolean } => {
    const r = marchRoute(from, to);
    const stops = routeTimeline(r, units);
    const points: Road["points"] = [];
    const kept: number[] = [];

    // Only the corners: drop tiles where the road runs straight on.
    r.path.forEach((q, k) => {
      const prev = r.path[k - 1];
      const next = r.path[k + 1];

      if (prev && next && q.x - prev.x === next.x - q.x && q.y - prev.y === next.y - q.y && r.wet[k] === r.wet[k - 1]) return;
      points.push({ x: px(q.x), y: py(q.y) });
      kept.push(stops[k]);
    });

    return { road: { points, stops: kept }, atSea: pointAlong(r, stops, f).atSea };
  };

  // A bigger window loads a bigger area: keep the same spot in view.
  const origin = useRef<{ ox: number; oy: number } | null>(null);

  useLayoutEffect(() => {
    const el = scroller.current;
    const o = origin.current;

    if (data && el && o && (o.ox !== ox || o.oy !== oy)) {
      el.scrollLeft += (o.ox - ox) * T * zoomRef.current;
      el.scrollTop += (o.oy - oy) * T * zoomRef.current;
    }
    if (data) origin.current = { ox, oy };
  }, [data, ox, oy]);

  // Start centred on your tribe (or the one you came to take revenge on).
  useLayoutEffect(() => {
    const el = scroller.current;

    if (!data || !el || centred.current) return;
    const focus =
      (focusId && data.tribes.find((t) => t.id === focusId)) || data.home;

    paint(Math.max(1, minZoom()), 0, 0, 0, 0);

    el.scrollLeft = px(focus.x) * zoomRef.current - el.clientWidth / 2;
    el.scrollTop = py(focus.y) * zoomRef.current - el.clientHeight / 2;
    centred.current = true;
    if (focusId) {
      const t = data.tribes.find((x) => x.id === focusId);

      if (t) setSelected({ kind: "tribe", tribe: t });
    }
  }, [data]);

  // Mouse (Telegram Desktop): drag to pan; the wheel scrolls both ways.
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const el = scroller.current;

    if (e.pointerType !== "mouse" || e.button !== 0 || !el) return;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
      moved: false,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = scroller.current;

    if (!d || !el) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;

    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 5) {
      d.moved = true;
      el.setPointerCapture?.(e.pointerId);
    }
    if (d.moved) {
      el.scrollLeft = d.left - dx;
      el.scrollTop = d.top - dy;
    }
  };
  const endDrag = (e: React.PointerEvent) => {
    scroller.current?.releasePointerCapture?.(e.pointerId);
    // Let the click that ends a drag be swallowed, then reset.
    setTimeout(() => (drag.current = null), 0);
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current?.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  // ─── Zoom: mouse wheel, trackpad pinch, two-finger pinch, +/− buttons ──────
  // Zoom is drawn straight to the DOM every frame (no React render of the
  // whole map), and eases toward its target so it never jumps.
  const zoomRef = useRef(1);
  const sizer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const goal = useRef<{
    z: number;
    fx: number;
    fy: number;
    bx: number;
    by: number;
  } | null>(null);
  const frame = useRef(0);
  const nRef = useRef(0);

  nRef.current = n;

  /** Smallest zoom that still fills the box, so no empty space shows. */
  const minZoom = useCallback(() => {
    const el = scroller.current;
    const size = nRef.current * T;

    if (!el || !size) return MIN_ZOOM;

    return Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, el.clientWidth / size, el.clientHeight / size),
    );
  }, []);

  /** Draws zoom z, keeping map point (bx, by) under viewport point (fx, fy). */
  const paint = useCallback(
    (z: number, fx: number, fy: number, bx: number, by: number) => {
      const el = scroller.current;
      const size = nRef.current * T;

      zoomRef.current = z;
      if (sizer.current) {
        sizer.current.style.width = `${size * z}px`;
        sizer.current.style.height = `${size * z}px`;
      }
      if (inner.current) inner.current.style.transform = `scale(${z})`;
      if (el) {
        el.scrollLeft = bx * z - fx;
        el.scrollTop = by * z - fy;
      }
    },
    [],
  );

  /** Zooms toward `next`, keeping the map point under `focus` (px in the viewport) still. */
  const zoomTo = useCallback(
    (next: number, focus?: { x: number; y: number }, instant = false) => {
      const el = scroller.current;

      if (!el) return;
      const z0 = zoomRef.current;
      const z = Math.max(minZoom(), Math.min(MAX_ZOOM, next));
      const fx = focus?.x ?? el.clientWidth / 2;
      const fy = focus?.y ?? el.clientHeight / 2;
      const g = {
        z,
        fx,
        fy,
        bx: (el.scrollLeft + fx) / z0,
        by: (el.scrollTop + fy) / z0,
      };

      goal.current = g;
      if (instant) {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        paint(z, fx, fy, g.bx, g.by);

        return;
      }
      if (frame.current) return; // the running animation picks up the new goal
      const step = () => {
        const t = goal.current;

        if (!t) return (frame.current = 0);
        const cur = zoomRef.current;
        const done = Math.abs(t.z - cur) < 0.002;
        const z1 = done ? t.z : cur + (t.z - cur) * 0.25;

        paint(z1, t.fx, t.fy, t.bx, t.by);
        frame.current = done ? 0 : requestAnimationFrame(step);
      };

      frame.current = requestAnimationFrame(step);
    },
    [minZoom, paint],
  );
  /** Where the next zoom step starts from (the goal while one is easing). */
  const zoomNow = () =>
    frame.current && goal.current ? goal.current.z : zoomRef.current;

  const hasMap = !!data;

  useEffect(() => {
    const el = scroller.current;

    if (!el) return;
    const local = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();

      return { x: cx - r.left, y: cy - r.top };
    };
    // Wheel zooms. Shift+wheel and sideways trackpad swipes still pan.
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
        el.scrollLeft += e.deltaY || e.deltaX;
        e.preventDefault();

        return;
      }
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // trackpad pan
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 33 : 1; // lines → px
      const speed = e.ctrlKey ? 0.01 : 0.0018; // pinch gestures send small deltas

      zoomTo(
        (e.ctrlKey ? zoomRef.current : zoomNow()) *
          Math.exp(-e.deltaY * unit * speed),
        local(e.clientX, e.clientY),
        e.ctrlKey,
      );
    };
    // Two-finger pinch on phones and tablets.
    let pinch: { d: number; z: number } | null = null;
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2)
        pinch = { d: dist(e.touches), z: zoomRef.current };
    };
    const onMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const mid = local(
        (e.touches[0].clientX + e.touches[1].clientX) / 2,
        (e.touches[0].clientY + e.touches[1].clientY) / 2,
      );

      zoomTo(pinch.z * (dist(e.touches) / pinch.d), mid, true);
    };
    const onEnd = () => (pinch = null);

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [hasMap, zoomTo]);

  // Window resized (Telegram Desktop, rotating a tablet): ease the zoom so
  // the map still fills the box, and load more of the world if needed.
  useEffect(() => {
    const el = box.current;

    if (!el || typeof ResizeObserver === "undefined") return;
    let last = 0;
    let size = { w: el.clientWidth, h: el.clientHeight };
    const ro = new ResizeObserver(() => {
      const sc = scroller.current;

      // Keep the middle of the view in the middle.
      if (sc) {
        sc.scrollLeft -= (el.clientWidth - size.w) / 2;
        sc.scrollTop -= (el.clientHeight - size.h) / 2;
      }
      size = { w: el.clientWidth, h: el.clientHeight };
      if (zoomRef.current < minZoom() - 0.001) zoomTo(minZoom());
      if (wantedRadius(el) > radius.current && Date.now() - last > 1000) {
        last = Date.now();
        load();
      }
    });

    ro.observe(el);

    return () => ro.disconnect();
  }, [hasMap, load, minZoom, zoomTo]);

  const recentre = () => {
    const el = scroller.current;

    if (!data || !el) return;
    const z = zoomRef.current;

    el.scrollTo({
      left: px(data.home.x) * z - el.clientWidth / 2,
      top: py(data.home.y) * z - el.clientHeight / 2,
      behavior: "smooth",
    });
  };

  const strength = (p: number) => {
    const ratio = p / Math.max(1, data?.myPower ?? 1);

    return ratio < 0.75 ? "weaker" : ratio > 1.33 ? "stronger" : "even";
  };

  const returning = state.marches;
  // Armies walking home that we can place on the map. Marches saved before
  // `leftAt` existed fall back to an estimate of the trip from the route.
  const homeward = data
    ? returning
        .filter((m) => m.from && m.returnsAt > now)
        .map((m) => ({
          id: m.id,
          units: m.units,
          from: m.from!,
          returnsAt: m.returnsAt,
          leftAt:
            m.leftAt ?? m.returnsAt - routeMs(m.units, m.from!, data.home),
        }))
    : [];
  // Armies still on the road, and the ones fighting where they arrived.
  const marching = data?.movements.filter((m) => !m.battle) ?? [];
  const battles = (data?.movements.filter((m) => m.battle) ?? []) as BattleMovement[];
  const incoming = marching.filter((m) => m.kind === "incoming");
  const mine = marching.filter((m) => m.kind === "outgoing");
  const watched = battles.find((m) => m.id === watching) ?? null;
  const merchants =
    data?.caravans?.filter((c) => c.kind !== "other" && c.arrivesAt > now) ??
    [];

  /** One of your armies marching out, as something you can give orders. */
  const outbound = (m: Movement): ArmyOnRoad => ({
    kind: "attack",
    id: m.id,
    units: m.units ?? ({} as Army),
    from: m.from,
    to: m.to,
    toName: m.to.name,
    startedAt: m.sentAt,
    endsAt: m.arrivesAt,
    loot: m.loot ?? null,
    coins: m.coins ?? 0,
    hops: m.hops ?? 0,
  });
  const homebound = (m: (typeof homeward)[number]): ArmyOnRoad => {
    const full = returning.find((x) => x.id === m.id)!;

    return {
      kind: "march",
      id: m.id,
      units: m.units,
      from: m.from,
      to: data!.home,
      toName: "Your tribe",
      startedAt: m.leftAt,
      endsAt: m.returnsAt,
      loot: full.loot,
      coins: full.coins,
      hops: full.hops ?? 0,
    };
  };

  /** A target's details for the march drawers, from `from` (home, or where a redirected army stands). */
  const tribeTarget = (t: Tribe, from: { x: number; y: number }): AttackTarget => {
    const s = scouts[t.id];

    return {
      title: `Raid ${t.name}`,
      to: { target: t.id },
      defense: s
        ? {
            min: s.defense / (1 + TERRAIN[t.terrain].defense),
            max: s.defense / (1 + TERRAIN[t.terrain].defense),
            exact: true,
          }
        : t.defense!,
      distance: Math.round(Math.hypot(t.x - from.x, t.y - from.y) * 10) / 10,
      terrain: t.terrain,
      from,
      at: { x: t.x, y: t.y },
      harbor: t.harbor ?? 0,
      note:
        state.shieldUntil > now ? "Attacking ends your own shield." : undefined,
    };
  };
  const campTarget = (c: Camp, from: { x: number; y: number }): AttackTarget => ({
    title: `Barbarian camp ${c.level}`,
    to: { camp: c.level },
    defense: { min: c.defense, max: c.defense, exact: true },
    distance: Math.round(Math.hypot(c.x - from.x, c.y - from.y) * 10) / 10,
    terrain: c.terrain,
    from,
    at: { x: c.x, y: c.y },
  });

  const attackTribe = (t: Tribe) => {
    setSelected(null);
    onAttack(tribeTarget(t, data!.home));
  };
  const attackCamp = (c: Camp) => {
    setSelected(null);
    onAttack(campTarget(c, data!.home));
  };

  /** The army waiting for new orders goes for this target instead. */
  const redirectTo = (target: (from: { x: number; y: number }) => AttackTarget) => {
    if (!picking) return;
    setSelected(null);
    setRedirecting({ army: picking, target: target(armySpot(picking, now).tile) });
    setPicking(null);
  };

  const doScout = async (t: Tribe) => {
    setBusy(true);
    const r = await scout(t.id);

    setBusy(false);
    if (r) setScouts((m) => ({ ...m, [t.id]: r }));
  };

  const doRecall = async (id: number) => {
    if (await recall(id)) load();
  };
  const ordersButton = (a: ArmyOnRoad) => (
    <button
      className="btn btn-wood btn-sm shrink-0 font-sans font-extrabold text-xs"
      onClick={() => setOrdersFor(a)}
    >
      <GameIcon e="🧭" /> Orders
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Armies on the move */}
      {(incoming.length > 0 ||
        mine.length > 0 ||
        battles.length > 0 ||
        returning.length > 0 ||
        merchants.length > 0) && (
        <div className="flex flex-col gap-1.5">
          {battles.map((m) => (
            <BattleRow key={`f${m.id}`} m={m} now={now} onWatch={() => setWatching(m.id)} />
          ))}
          {incoming.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-xl px-3 py-2 bg-[#2A140E] border border-[#8A3B23] text-sm"
            >
              <span className="text-lg animate-pulse"><GameIcon e="🔥" /></span>
              <span className="flex-1 min-w-0">
                <b>{m.from.name}</b> is marching on you
                <span className="block text-xs text-[#FFB27A]">
                  {m.units ? (
                    <ArmyLine army={m.units} />
                  ) : (
                    "Build a Watchtower to see their army"
                  )}
                </span>
              </span>
              <span className="font-display font-black text-[#FFB27A] shrink-0">
                {formatDuration(m.arrivesAt - now)}
              </span>
            </div>
          ))}
          {mine.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 card px-3 py-2 !border-gold/60 text-sm"
            >
              <span className="text-lg"><GameIcon e="⚔️" /></span>
              <span className="flex-1 min-w-0 truncate">
                To <b>{m.to.name}</b>
                <span className="block text-xs text-muted truncate">
                  {m.units && <ArmyLine army={m.units} />}
                </span>
              </span>
              <span className="font-display font-black text-goldtext shrink-0">
                {formatDuration(m.arrivesAt - now)}
              </span>
              {ordersButton(outbound(m))}
            </div>
          ))}
          {returning.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 card px-3 py-2 text-sm"
            >
              <span className="text-lg">↩️</span>
              <span className="flex-1 min-w-0 truncate">
                Back from <b>{m.target}</b>
                <span className="block text-xs text-muted truncate">
                  <ArmyLine army={m.units} />
                </span>
              </span>
              <span className="font-display font-black text-sub shrink-0">
                {formatDuration(m.returnsAt - now)}
              </span>
              {(() => {
                const h = homeward.find((x) => x.id === m.id);

                return h ? ordersButton(homebound(h)) : null;
              })()}
            </div>
          ))}
          {merchants.map((c) => (
            <div
              key={c.id}
              className={clsx(
                "flex items-center gap-2 card px-3 py-2 text-sm",
                c.kind === "coming" ? "border-[#5E7F45]" : "border-line",
              )}
            >
              <span className="text-lg"><GameIcon e="🐪" /></span>
              <span className="flex-1 min-w-0 truncate">
                {c.kind === "coming" ? (
                  <>
                    <b>
                      {fmt(c.amount)} {RESOURCE_NAMES[c.resource]}
                    </b>{" "}
                    coming from {c.from.name}
                  </>
                ) : (
                  <>
                    <b>
                      {fmt(c.amount)} {RESOURCE_NAMES[c.resource]}
                    </b>{" "}
                    on its way to {c.to.name}
                  </>
                )}
              </span>
              <span
                className={clsx(
                  "font-display font-black shrink-0",
                  c.kind === "coming" ? "text-good" : "text-sub",
                )}
              >
                {formatDuration(c.arrivesAt - now)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* The map */}
      <div
        ref={box}
        className="relative rounded-2xl overflow-hidden border border-line h-[max(320px,calc(100svh-260px))] bg-[#1B2416]"
      >
        {!data && !error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            Unrolling the map…
          </p>
        )}
        {error && !data && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-bad">
            {error}
            <Button size="small" variant="outline" onClick={load}>
              Try again
            </Button>
          </div>
        )}
        {data && (
          <div
            ref={scroller}
            className={clsx(
              "absolute inset-0 overflow-auto overscroll-contain select-none no-scrollbar",
              drag.current?.moved ? "cursor-grabbing" : "cursor-grab",
            )}
            onClickCapture={onClickCapture}
            onPointerCancel={endDrag}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
          >
            <div
              ref={sizer}
              className="relative"
              style={{
                width: n * T * zoomRef.current,
                height: n * T * zoomRef.current,
              }}
            >
              <div
                ref={inner}
                className="absolute left-0 top-0 origin-top-left"
                style={{
                  width: n * T,
                  height: n * T,
                  transform: `scale(${zoomRef.current})`,
                }}
              >
                <svg
                  aria-hidden="true"
                  className="absolute inset-0"
                  height={n * T}
                  width={n * T}
                >
                  <Ground n={n} ox={ox} oy={oy} />
                  {/* Faint grid so distances read */}
                  <g opacity="0.12" stroke="#000">
                    {Array.from({ length: n + 1 }, (_, i) => (
                      <g key={i}>
                        <line x1={i * T} x2={i * T} y1={0} y2={n * T} />
                        <line x1={0} x2={n * T} y1={i * T} y2={i * T} />
                      </g>
                    ))}
                  </g>
                  {/* Merchant roads, under the armies' */}
                  {(data.caravans ?? [])
                    .filter((c) => c.arrivesAt > now)
                    .map((c) => (
                      <Route
                        key={`r${c.id}`}
                        merchant
                        color={ROUTE_COLORS[c.kind]}
                        faint={c.kind === "other"}
                        from={{ x: px(c.from.x), y: py(c.from.y) }}
                        p={progress(now, c.sentAt, c.arrivesAt)}
                        to={{ x: px(c.to.x), y: py(c.to.y) }}
                      />
                    ))}
                  {/* Marches */}
                  {marching.map((m) => {
                    const f = progress(now, m.sentAt, m.arrivesAt);

                    return (
                      <Route
                        key={`r${m.id}`}
                        color={ROUTE_COLORS[m.kind]}
                        from={{ x: px(m.from.x), y: py(m.from.y) }}
                        p={f}
                        road={roadOf(m.from, m.to, m.units, f).road}
                        to={{ x: px(m.to.x), y: py(m.to.y) }}
                      />
                    );
                  })}
                  {homeward.map((m) => {
                    const f = progress(now, m.leftAt, m.returnsAt);

                    return (
                      <Route
                        key={`b${m.id}`}
                        color={ROUTE_COLORS.outgoing}
                        from={{ x: px(m.from.x), y: py(m.from.y) }}
                        p={f}
                        road={roadOf(m.from, data.home, m.units, f).road}
                        to={{ x: px(data.home.x), y: py(data.home.y) }}
                      />
                    );
                  })}
                </svg>

                {/* Barbarian camps */}
                {data.camps.map((c) => (
                  <button
                    key={`c${c.level}`}
                    aria-label={`Barbarian camp ${c.level}`}
                    className={clsx(
                      "absolute flex flex-col items-center",
                      c.state === "locked" && "opacity-45 grayscale",
                    )}
                    style={{ left: px(c.x) - 24, top: py(c.y) - 26, width: 48 }}
                    onClick={() => setSelected({ kind: "camp", camp: c })}
                  >
                    <Image
                      draggable={false}
                      alt=""
                      className="w-11 h-11 object-contain drop-shadow-[0_3px_3px_rgba(0,0,0,0.6)]"
                      height={88}
                      src={buildingImage(BUILDING_BY_ID["barracks"])}
                      width={88}
                    />
                    <span
                      className={clsx(
                        "-mt-1.5 px-1.5 rounded-full text-[10px] font-black border",
                        c.state === "new"
                          ? "bg-ember text-[#FFF4EA] border-[#FFD2B0]"
                          : c.state === "ready"
                            ? "bg-good text-[#1A120B] border-[#E6F5D9]"
                            : "bg-panel text-sub border-line",
                      )}
                    >
                      {c.state === "locked"
                        ? <GameIcon e="🔒" />
                        : c.state === "cooldown"
                          ? formatDuration(c.readyAt - now)
                          : `Camp ${c.level}`}
                    </span>
                  </button>
                ))}

                {/* Tribes */}
                {data.tribes.map((t) => {
                  const shielded = t.shieldUntil > now;
                  const s = strength(t.power);

                  return (
                    <button
                      key={t.id}
                      aria-label={t.isMe ? "Your tribe" : t.name}
                      className="absolute flex flex-col items-center"
                      style={{
                        left: px(t.x) - 32,
                        top: py(t.y) - 34,
                        width: 64,
                        zIndex: t.isMe ? 3 : 2,
                      }}
                      onClick={() => setSelected({ kind: "tribe", tribe: t })}
                    >
                      {t.terrain === "sea" && (
                        // Settled before the seas were charted: a little island of their own.
                        <span
                          className="absolute rounded-[50%] border-2 border-[#E6D3A0]/70"
                          style={{ left: 4, top: 6, width: 56, height: 44, background: SAND }}
                        />
                      )}
                      <span
                        className={clsx(
                          "relative w-12 h-12 rounded-full flex items-center justify-center border-[3px] bg-panel/70",
                          t.isMe
                            ? "border-gold shadow-[0_0_16px_rgba(227,169,72,0.8)]"
                            : t.ally
                              ? "border-[#7FB3D0] shadow-[0_0_10px_rgba(127,179,208,0.6)]"
                              : s === "weaker"
                              ? "border-good"
                              : s === "stronger"
                                ? "border-[#F08A6C]"
                                : "border-gold/70",
                        )}
                      >
                        <Image
                          draggable={false}
                          alt=""
                          className="w-10 h-10 object-contain"
                          height={80}
                          src={buildingImage(BUILDING_BY_ID["town-hall"])}
                          width={80}
                        />
                        {shielded && !t.isMe && (
                          <span className="absolute -top-1 -right-1 text-sm">
                            <GameIcon e="🛡️" />
                          </span>
                        )}
                        <span className="absolute -bottom-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-[#1A120B] text-[10px] font-black flex items-center justify-center">
                          {t.townHall}
                        </span>
                        {t.clan && (
                          <span className="absolute -top-3 -left-2.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                            <ClanFlag flag={t.clan.flag} size={22} title={`[${t.clan.tag}]`} />
                          </span>
                        )}
                      </span>
                      <span
                        className={clsx(
                          "mt-0.5 max-w-[84px] truncate px-1.5 rounded-full text-[10px] font-extrabold",
                          t.isMe
                            ? "bg-gold text-[#1A120B]"
                            : "bg-panel/90 text-parch border border-line",
                        )}
                      >
                        {t.isMe ? "You" : t.clan ? `[${t.clan.tag}] ${t.name}` : t.name}
                      </span>
                    </button>
                  );
                })}

                {/* Caravans and armies on the road */}
                {(data.caravans ?? [])
                  .filter((c) => c.arrivesAt > now)
                  .map((c) => (
                    <CaravanToken
                      key={`t${c.id}`}
                      amount={c.amount}
                      from={{ x: px(c.from.x), y: py(c.from.y) }}
                      kind={c.kind}
                      left={c.arrivesAt - now}
                      p={progress(now, c.sentAt, c.arrivesAt)}
                      resource={c.resource}
                      to={{ x: px(c.to.x), y: py(c.to.y) }}
                    />
                  ))}
                {homeward.map((m) => {
                  const f = progress(now, m.leftAt, m.returnsAt);
                  const { road, atSea } = roadOf(m.from, data.home, m.units, f);

                  return (
                    <ArmyToken
                      key={`b${m.id}`}
                      atSea={atSea}
                      from={{ x: px(m.from.x), y: py(m.from.y) }}
                      incoming={false}
                      left={Math.max(0, m.returnsAt - now)}
                      p={f}
                      road={road}
                      to={{ x: px(data.home.x), y: py(data.home.y) }}
                      units={m.units}
                      onClick={() => setOrdersFor(homebound(m))}
                    />
                  );
                })}
                {battles.map((m) => (
                  <BattleToken
                    key={`f${m.id}`}
                    at={{ x: px(m.to.x), y: py(m.to.y) }}
                    m={m}
                    now={now}
                    onClick={() => setWatching(m.id)}
                  />
                ))}
                {marching.map((m) => {
                  const f = progress(now, m.sentAt, m.arrivesAt);
                  const { road, atSea } = roadOf(m.from, m.to, m.units, f);

                  return (
                    <ArmyToken
                      key={`t${m.id}`}
                      atSea={atSea}
                      from={{ x: px(m.from.x), y: py(m.from.y) }}
                      incoming={m.kind === "incoming"}
                      left={Math.max(0, m.arrivesAt - now)}
                      p={f}
                      road={road}
                      to={{ x: px(m.to.x), y: py(m.to.y) }}
                      units={m.units}
                      onClick={m.kind === "outgoing" ? () => setOrdersFor(outbound(m)) : undefined}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {picking && (
          <div className="absolute inset-x-2 bottom-2 z-20 flex items-center gap-2 rounded-xl px-3 py-2 bg-ink/90 border border-gold text-sm shadow-lg mr-14">
            <span className="text-lg animate-pulse">
              <GameIcon e="🧭" />
            </span>
            <span className="flex-1 min-w-0 leading-tight">
              <b className="text-goldtext">Pick a new target</b>
              <span className="block text-[11px] text-sub">Tap a tribe or a camp on the map.</span>
            </span>
            <button className="btn btn-wood btn-sm shrink-0 font-sans font-extrabold text-xs" onClick={() => setPicking(null)}>
              Cancel
            </button>
          </div>
        )}
        {data && (
          <div className="absolute right-2 bottom-2 flex flex-col gap-1.5 z-10">
            <button
              aria-label="Zoom in"
              className="btn btn-wood w-11 h-11 px-0 text-xl text-goldtext"
              onClick={() => zoomTo(zoomNow() * 1.4)}
            >
              +
            </button>
            <button
              aria-label="Zoom out"
              className="btn btn-wood w-11 h-11 px-0 text-xl text-goldtext"
              onClick={() => zoomTo(zoomNow() / 1.4)}
            >
              −
            </button>
            <button
              aria-label="Back to my tribe"
              className="btn btn-wood w-11 h-11 px-0"
              onClick={recentre}
            >
              <span className="w-9 h-9 rounded-full border-2 border-gold bg-panel/70 shadow-[0_0_10px_rgba(227,169,72,0.7)] flex items-center justify-center">
                <Image
                  draggable={false}
                  alt=""
                  className="w-7 h-7 object-contain"
                  height={56}
                  src={buildingImage(BUILDING_BY_ID["town-hall"])}
                  width={56}
                />
              </span>
            </button>
          </div>
        )}
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5 card-flat !bg-ink/80 px-2 py-1">
          <span className="text-[11px] font-bold text-sub">
            <span className="text-good">●</span> weaker{" "}
            <span className="text-gold">●</span> even{" "}
            <span className="text-bad">●</span> stronger
          </span>
          <InfoDrawer
            content={
              <span className="flex flex-col gap-1.5 text-left text-sm">
                <span>
                  Armies march across the map; farther targets take longer. An
                  army moves at the speed of its slowest unit (light cavalry fastest,
                  catapults slowest). The battle happens when it arrives.
                </span>
                <span>
                  <GameIcon e="⛰️" /> Armies follow roads, not straight lines: they march around
                  mountains and lakes, and forests and hills slow them down. When
                  the way round is too long, they sail.
                </span>
                <span>
                  <GameIcon e="⛰️" /> Hills give the defender +20% defense, <GameIcon e="🌲" /> forests +10%, and
                  horsemen (light cavalry, paladins, knights) fight 25% weaker in forests.
                </span>
                <span>
                  <GameIcon e="🛡️" /> Spearmen defend 50% better against horsemen. Rams
                  break the City Gate, catapults the Watchtower. Mix your army
                  to match the target.
                </span>
                <span>
                  <GameIcon e="🔭" /> With an Exploration Center you can scout a tribe for coins:
                  exact defense, troops at home and what you could loot.
                </span>
                <span>
                  <GameIcon e="🗼" /> A Watchtower shows you which troops are marching on you, so
                  you can train defenders in time.
                </span>
                <span>
                  You can recall an army before it arrives. Raided tribes get a
                  2h shield.
                </span>
                <span>
                  <GameIcon e="🧭" /> Tap one of your armies on the road to give it new orders: on its way out or
                  on its way home with the spoils, it can march on another tribe or camp from where it stands.
                  It can leave troops behind but never take on more. Supplies for the new road come out of the
                  spoils first. One new order per expedition; the War Orders card adds more.
                </span>
                <span>
                  <GameIcon e="⚔️" /> When armies meet, the battle lasts from 1 minute up to 30,
                  longer the more troops fight. Tap the crossed swords to watch it
                  round by round; the defenders are on the field until it ends.
                </span>
                <span>🖱️ Scroll or pinch to zoom, drag to move around.</span>
              </span>
            }
            title="War on the map"
          />
        </div>
      </div>

      {/* What's on the tile you tapped */}
      <Drawer
        isOpen={!!selected}
        position="bottom"
        title={
          selected?.kind === "camp"
            ? `Barbarian camp ${selected.camp.level}`
            : selected?.kind === "tribe"
              ? selected.tribe.isMe
                ? "Your tribe"
                : selected.tribe.name
              : ""
        }
        onClose={() => setSelected(null)}
      >
        {selected?.kind === "tribe" &&
          (() => {
            const t = selected.tribe;
            const sc = scouts[t.id];
            const shielded = t.shieldUntil > now;
            const s = strength(t.power);
            const ground = TERRAIN[t.terrain];

            return (
              <div className="flex flex-col gap-3 pt-2">
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  {t.clan && (
                    <span
                      className={clsx(
                        "flex items-center gap-1 px-2 py-0.5 rounded-lg border",
                        t.ally ? "bg-[#14222A] border-[#7FB3D0] text-[#A9D3EA]" : "bg-panel2 border-line",
                      )}
                    >
                      <ClanFlag flag={t.clan.flag} size={20} />[{t.clan.tag}]{t.ally && !t.isMe ? " · your clan" : ""}
                    </span>
                  )}
                  <span className="pill h-7 px-2">
                    <GameIcon e={TERRAIN_ICON[t.terrain]} /> {ground.name}
                    {ground.defense > 0 &&
                      ` · +${ground.defense * 100}% defense`}
                  </span>
                  {!t.isMe && (
                    <span className="pill h-7 px-2">
                      <GameIcon e="📍" /> {t.distance} tiles
                    </span>
                  )}
                  <span className="pill h-7 px-2">
                    🏛 Town Hall {t.townHall}
                  </span>
                  {t.coastal && (
                    <span className="pill pill-sea h-7 px-2">
                      <GameIcon e="⚓" /> Coastal{t.harbor ? ` · Harbor ${t.harbor}` : ""}
                    </span>
                  )}
                  <span className="pill h-7 px-2">
                    <GameIcon e="👥" /> {fmt(t.population)}
                  </span>
                  <span
                    className={clsx(
                      "px-2 py-1 rounded-lg border",
                      t.isMe
                        ? "bg-panel2 border-line"
                        : s === "weaker"
                          ? "bg-[#1C2A14] border-good text-good"
                          : s === "stronger"
                            ? "bg-[#2A140E] border-[#8A3B23] text-bad"
                            : "bg-panel2 border-gold text-goldtext",
                    )}
                  >
                    <GameIcon e="💪" /> {fmt(t.power)}{" "}
                    {t.isMe
                      ? ""
                      : s === "weaker"
                        ? "· weaker than you"
                        : s === "stronger"
                          ? "· stronger than you"
                          : "· about even"}
                  </span>
                </div>
                {t.isMe ? (
                  <>
                    <p className="text-sm text-sub">
                      Your home on {ground.name.toLowerCase()}. {t.terrain === "sea" ? "An island of your own." : ground.note}{" "}
                      {incoming.length
                        ? `${incoming.length} army marching on you.`
                        : "No enemies on the way."}
                    </p>
                    {t.coastal && <SeaNote coastal harbor={t.harbor ?? 0} />}
                  </>
                ) : (
                  <>
                    {seaRoute(data!.home, t).naval && <SeaNote harbor={t.harbor ?? 0} myHarbor={state.buildings["harbor"] ?? 0} ships={state.army.longship} />}
                    {sc ? (
                      <div className="inset p-2.5 flex flex-col gap-1.5 text-sm">
                        <div className="text-[10px] font-extrabold tracking-[0.12em] text-muted">
                          SCOUT REPORT · {formatDuration(now - sc.at)} AGO
                        </div>
                        <div>
                          <GameIcon e="🛡️" /> Defense <b>{fmt(sc.defense)}</b>{" "}
                          <span className="text-muted text-xs">
                            (terrain included)
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-2">
                          <span className="text-muted">Home:</span>
                          {(Object.keys(sc.troops) as UnitId[]).map((u) => (
                            <span key={u}>
                              <UnitEmoji unit={u} /> {fmt(sc.troops[u])}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-x-2">
                          <span className="text-muted">Lootable:</span>
                          {(Object.keys(sc.loot) as ResourceId[]).map((r) => (
                            <span key={r}>
                              {fmt(sc.loot[r])}{" "}
                              {RESOURCE_NAMES[r].toLowerCase()}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      t.defense && (
                        <p className="text-sm text-sub">
                          <GameIcon e="🛡️" /> Defense about{" "}
                          <b>
                            {t.defense.exact
                              ? fmt(t.defense.min * (1 + ground.defense))
                              : `${fmt(t.defense.min * (1 + ground.defense))}–${fmt(t.defense.max * (1 + ground.defense))}`}
                          </b>
                          {!t.defense.exact && " (a guess — scout to know)"}
                        </p>
                      )
                    )}
                    {shielded && (
                      <p className="text-sm font-bold text-gold">
                        <GameIcon e="🛡️" /> Shielded for {formatDuration(t.shieldUntil - now)}.
                        You can't attack until it ends.
                      </p>
                    )}
                    <div className="flex gap-2">
                      {rates.canScout ? (
                        <Button
                          className="flex-1"
                          disabled={busy}
                          variant="outline"
                          onClick={() => doScout(t)}
                        >
                          <GameIcon e="🔭" /> Scout · {fmt(scoutCost(t.distance))} coins
                        </Button>
                      ) : (
                        <p className="flex-1 text-xs text-muted self-center">
                          Build an Exploration Center to scout.
                        </p>
                      )}
                      {t.ally ? (
                        <p className="flex-1 text-xs font-bold text-[#A9D3EA] self-center">
                          <GameIcon e="🤝" /> Clanmate. You fight side by side, not against each other.
                        </p>
                      ) : picking ? (
                        <Button
                          className="flex-1"
                          disabled={shielded}
                          onClick={() => redirectTo((from) => tribeTarget(t, from))}
                        >
                          <GameIcon e="🧭" /> Send army here
                        </Button>
                      ) : (
                        <Button
                          className="flex-1"
                          disabled={shielded}
                          onClick={() => attackTribe(t)}
                        >
                          <GameIcon e="⚔️" /> Attack
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

        {selected?.kind === "camp" &&
          (() => {
            const c = selected.camp;
            const ground = TERRAIN[c.terrain];
            const fightingCamp = battles.some((m) => m.kind === "outgoing" && m.campLevel === c.level);
            const busyCamp = fightingCamp || mine.some((m) => m.campLevel === c.level);

            return (
              <div className="flex flex-col gap-3 pt-2">
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className="pill h-7 px-2">
                    <GameIcon e={TERRAIN_ICON[c.terrain]} /> {ground.name}
                    {ground.defense > 0 &&
                      ` · +${ground.defense * 100}% defense`}
                  </span>
                  <span className="pill h-7 px-2">
                    <GameIcon e="📍" /> {c.distance} tiles
                  </span>
                  <span className="pill h-7 px-2">
                    <GameIcon e="🛡️" /> {fmt(c.defense * (1 + ground.defense))}
                  </span>
                </div>
                {seaRoute(data!.home, c).naval && (
                  <SeaNote camp myHarbor={state.buildings["harbor"] ?? 0} ships={state.army.longship} />
                )}
                <p className="text-sm text-sub">
                  <GameIcon e="🎁" /> {fmt(c.reward.resources)} of each resource + <GameIcon e="🪙" />{" "}
                  {fmt(c.reward.coins)}
                  {c.reward.first
                    ? " for the first win"
                    : " (beaten camps give a smaller haul every hour)"}
                  .
                </p>
                {c.state === "locked" ? (
                  <p className="text-sm font-bold text-muted">
                    <GameIcon e="🔒" /> Beat camp {c.level - 1} first.
                  </p>
                ) : c.state === "cooldown" ? (
                  <p className="text-sm font-bold text-muted">
                    The barbarians regroup in {formatDuration(c.readyAt - now)}.
                  </p>
                ) : busyCamp ? (
                  <p className="text-sm font-bold text-goldtext">
                    {fightingCamp ? "Your army is fighting here right now." : "Your army is already on its way."}
                  </p>
                ) : picking ? (
                  <Button isFull onClick={() => redirectTo((from) => campTarget(c, from))}>
                    <GameIcon e="🧭" /> Send army to camp {c.level}
                  </Button>
                ) : (
                  <Button isFull onClick={() => attackCamp(c)}>
                    <GameIcon e="⚔️" /> Attack camp {c.level}
                  </Button>
                )}
              </div>
            );
          })()}
      </Drawer>
      <LiveBattleDrawer m={watched} now={now} onClose={() => setWatching(null)} />
      <ArmyOrdersDrawer
        army={ordersFor}
        onClose={() => setOrdersFor(null)}
        onNewTarget={(a) => {
          setOrdersFor(null);
          setPicking(a);
        }}
        onRecall={(id) => {
          setOrdersFor(null);
          doRecall(id);
        }}
      />
      {data && (
        <RedirectDrawer
          army={redirecting?.army ?? null}
          home={data.home}
          target={redirecting?.target ?? null}
          onClose={() => setRedirecting(null)}
          onSent={() => {
            setRedirecting(null);
            load();
          }}
        />
      )}
    </div>
  );
};
