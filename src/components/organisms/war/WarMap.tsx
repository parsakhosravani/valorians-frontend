"use client";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import Image from "next/image";
import clsx from "clsx";

import {
  ArmyToken,
  CaravanToken,
  PathKind,
  PathRun,
  Road,
  TravelPath,
  TravelPaths,
  progress,
  spotOnRoad,
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
import { CHUNK, DETAIL_CHUNK, GroundOverview, GroundPiece, TILE, baseRes, closeUpRes } from "./MapGround";
import { pinScale, useMapCamera } from "./useMapCamera";
import { WorldMap } from "./WorldMap";

import { Button } from "@/components/atoms/Button";
import { Drawer } from "@/components/molecules/Drawer";
import { InfoDrawer } from "@/components/organisms/InfoDrawer";
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
  MAP_MAX,
  MAP_MIN,
  RESOURCE_NAMES,
  ResourceId,
  UnitId,
  buildingImage,
} from "@/lib/game/config";
import {
  MarchRoute,
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

const T = TILE;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.2;

/** The middle of a loaded area of radius r, kept so the area stays inside the world. */
const keepInWorld = (p: { x: number; y: number }, r: number) => ({
  x: Math.min(MAP_MAX - 1 - r, Math.max(MAP_MIN + r, Math.round(p.x))),
  y: Math.min(MAP_MAX - 1 - r, Math.max(MAP_MIN + r, Math.round(p.y))),
});

/** When the screen comes this close (tiles) to the edge of what's loaded, the next area loads. */
const EDGE = 8;

/**
 * Map radius (tiles) that fills this box even fully zoomed out, with room to
 * drag a good way before the next area has to load.
 */
const wantedRadius = (el: HTMLElement | null) => {
  const side = el ? Math.max(el.clientWidth, el.clientHeight) : 0;

  return Math.min(30, Math.max(24, Math.ceil(side / (T * MIN_ZOOM) / 2) + 1 + EDGE));
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

/** Village markers: smallest picture (Town Hall 0), how much bigger they grow, and the
 *  tile's centre inside the marker's box. */
const VILLAGE_MIN = 34;
const VILLAGE_GROW = 12;
const VX = 36;
const VY = 34;

/**
 * From this zoom up every village shows its name and every camp its full tag.
 * Below it the map stays quiet: only names that matter to you right now.
 */
const LABELS_ZOOM = 1.3;

/**
 * Height that makes the map end just above the bottom bar, so on a phone the
 * whole map is on screen and the page around it never needs scrolling (the
 * map takes every touch, so a page you can't see the end of is stuck).
 */
const useFillHeight = (box: RefObject<HTMLDivElement | null>) => {
  const [h, setH] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    const page = el?.closest<HTMLElement>(".scrollable");

    if (!el || !page) return;
    const measure = () => {
      const pad = parseFloat(getComputedStyle(page).paddingBottom) || 0;
      const top = el.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop;
      // 16px: the page's own gap under the map.
      const next = Math.max(300, Math.floor(page.clientHeight - pad - top - 16));

      setH((old) => (old === next ? old : next));
    };

    measure();
    const ro = new ResizeObserver(measure);

    ro.observe(page);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [box]);

  return h;
};

// ─── Roads ───────────────────────────────────────────────────────────────────

type Pt = { x: number; y: number };

/**
 * A trip on the map in px: the road its token follows (corners only, timed
 * for its troops) and the same road as land and sea stretches for the drawn path.
 */
type Trip = { r: MarchRoute; stops: number[]; road: Road; runs: PathRun[] };

/**
 * Trips worked out so far. The map re-renders every second; finding the road
 * and laying it out again each time for every traveller was wasted work.
 */
const TRIPS = new Map<string, Trip>();

const tripFor = (
  from: Pt,
  to: Pt,
  units: Army | null,
  px: (x: number) => number,
  py: (y: number) => number,
  origin: string,
): Trip => {
  const key = `${origin}|${from.x},${from.y}>${to.x},${to.y}|${units ? JSON.stringify(units) : ""}`;
  const hit = TRIPS.get(key);

  if (hit) return hit;
  const r = marchRoute(from, to);
  const stops = routeTimeline(r, units);
  const at = (q: Pt) => ({ x: px(q.x), y: py(q.y) });
  const straightOn = (k: number) => {
    const prev = r.path[k - 1];
    const next = r.path[k + 1];

    return !!prev && !!next && r.path[k].x - prev.x === next.x - r.path[k].x && r.path[k].y - prev.y === next.y - r.path[k].y;
  };
  const points: Pt[] = [];
  const kept: number[] = [];

  // Only the corners: drop tiles where the road runs straight on.
  r.path.forEach((q, k) => {
    if (straightOn(k) && r.wet[k] === r.wet[k - 1]) return;
    points.push(at(q));
    kept.push(stops[k]);
  });

  // The drawn path: a new stretch wherever the road reaches or leaves the water.
  const runs: PathRun[] = [];

  for (let k = 0; k < r.path.length - 1; k++) {
    const wet = r.wet[k] || r.wet[k + 1];
    const run = runs[runs.length - 1];

    if (!run || run.wet !== wet) runs.push({ wet, points: [at(r.path[k]), at(r.path[k + 1])] });
    else if (straightOn(k) && r.wet[k] === r.wet[k - 1]) run.points[run.points.length - 1] = at(r.path[k + 1]);
    else run.points.push(at(r.path[k + 1]));
  }
  if (!runs.length) runs.push({ wet: false, points: [at(from), at(to)] });

  const trip = { r, stops, road: { points, stops: kept }, runs };

  if (TRIPS.size > 300) TRIPS.delete(TRIPS.keys().next().value!);
  TRIPS.set(key, trip);

  return trip;
};

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

// ─── Villages and camps ──────────────────────────────────────────────────────
//
// The map re-renders every second (the game clock), and a loaded area can
// hold hundreds of villages. Built inline, every one of them was laid out
// again each second, even mid-drag, and the drag stuttered on every tick.
// As memoized pieces with plain props, a marker only renders again when
// something it shows has changed.

const CampMarker = memo(function CampMarker({
  c,
  left,
  top,
  picked,
  labelsAll,
  timer,
  onPick,
}: {
  c: Camp;
  left: number;
  top: number;
  picked: boolean;
  labelsAll: boolean;
  /** Time left on its cooldown, when that label shows. */
  timer?: string;
  onPick: (s: Selected) => void;
}) {
  return (
    <button
      aria-label={`Barbarian camp ${c.level}`}
      className={clsx(
        "map-pin absolute",
        c.state === "locked" && "grayscale brightness-[0.6]",
      )}
      style={{
        left: left - 32,
        top: top - 34,
        width: 64,
        height: 56,
        transformOrigin: "32px 34px",
        zIndex: picked ? 4 : 1,
      }}
      onClick={() => onPick({ kind: "camp", camp: c })}
    >
      {/* Soft shadow, then the ground ring */}
      <span className="absolute left-[16px] top-[33px] w-8 h-[12px] rounded-[50%] bg-[radial-gradient(closest-side,rgba(10,7,4,0.55),rgba(10,7,4,0))]" />
      <span
        className={clsx(
          "absolute left-[17px] top-[34px] w-[30px] h-[10px] rounded-[50%] border-[1.5px]",
          c.state === "locked"
            ? "border-line bg-ink/30"
            : "border-[#C2552E] bg-[#8A3B23]/35",
          picked && "shadow-[0_0_14px_rgba(240,106,68,0.9)]",
        )}
      />
      <Image
        draggable={false}
        alt=""
        className="absolute left-[16px] top-[11px] w-8 h-8 object-contain drop-shadow-[0_3px_2px_rgba(0,0,0,0.6)]"
        height={88}
        src={buildingImage(BUILDING_BY_ID["barracks"])}
        width={88}
      />
      {labelsAll || picked ? (
        <span
          className={clsx(
            "absolute left-1/2 top-[45px] -translate-x-1/2 whitespace-nowrap px-1.5 h-[15px] inline-flex items-center gap-0.5 rounded-md border font-display text-[9.5px] font-black leading-none shadow-[0_2px_4px_rgba(0,0,0,0.6)]",
            c.state === "new"
              ? "bg-ember text-[#FFF4EA] border-[#FFD2B0]"
              : c.state === "ready"
                ? "bg-good text-[#1A120B] border-[#E6F5D9]"
                : "bg-ink/90 text-sub border-line",
          )}
        >
          {c.state === "locked" ? (
            <>
              <GameIcon e="🔒" /> {c.level}
            </>
          ) : c.state === "cooldown" ? (
            timer
          ) : (
            `Camp ${c.level}`
          )}
        </span>
      ) : c.state !== "locked" ? (
        // Zoomed out: just the camp's number in a small badge, coloured by its state.
        <span
          className={clsx(
            "absolute left-1/2 top-[40px] -translate-x-1/2 min-w-[15px] h-[15px] px-0.5 rounded-full border-[1.5px] inline-flex items-center justify-center font-display text-[8.5px] font-black leading-none shadow-[0_2px_3px_rgba(0,0,0,0.6)]",
            c.state === "new"
              ? "bg-ember text-[#FFF4EA] border-[#FFD2B0]"
              : c.state === "ready"
                ? "bg-good text-[#1A120B] border-[#E6F5D9]"
                : "bg-ink/90 text-sub border-line",
          )}
        >
          {c.level}
        </span>
      ) : null}
    </button>
  );
});

const Village = memo(function Village({
  t,
  left,
  top,
  picked,
  loud,
  shielded,
  strength,
  onPick,
}: {
  t: Tribe;
  left: number;
  top: number;
  picked: boolean;
  /** Full labels (name, level, big shield). */
  loud: boolean;
  shielded: boolean;
  strength: "weaker" | "stronger" | "even";
  onPick: (s: Selected) => void;
}) {
  const ring = t.isMe
    ? "border-gold bg-gold/30 shadow-[0_0_18px_rgba(227,169,72,0.85)]"
    : t.ally
      ? "border-sea bg-sea/25 shadow-[0_0_10px_rgba(127,179,208,0.6)]"
      : strength === "weaker"
        ? "border-good bg-good/20"
        : strength === "stronger"
          ? "border-bad bg-bad/20"
          : "border-goldtext/80 bg-goldtext/15";

  // Villages grow a little with their Town Hall, so the strong ones stand out.
  const size = Math.round(VILLAGE_MIN + Math.min(VILLAGE_GROW, t.townHall * 0.6));
  const half = size / 2;
  // The marker is drawn round the tile's centre at (VX, VY) inside its box.
  const foot = VY + 6;

  return (
    <button
      aria-label={t.isMe ? "Your tribe" : t.name}
      className="map-pin absolute"
      style={{
        left: left - VX,
        top: top - VY,
        width: VX * 2,
        height: VY + 26,
        transformOrigin: `${VX}px ${VY}px`,
        zIndex: picked ? 4 : t.isMe ? 3 : 2,
      }}
      onClick={() => onPick({ kind: "tribe", tribe: t })}
    >
      {t.terrain === "sea" && (
        // Settled before the seas were charted: a little island of their own.
        <span
          className="absolute rounded-[50%] border border-[#E6D3A0]/70"
          style={{ left: VX - half - 6, top: foot - 12, width: size + 12, height: 22, background: SAND }}
        />
      )}
      {/* Soft shadow the village stands in */}
      <span
        className="absolute rounded-[50%] bg-[radial-gradient(closest-side,rgba(10,7,4,0.55),rgba(10,7,4,0))]"
        style={{ left: VX - half - 2, top: foot - 8, width: size + 4, height: 14 }}
      />
      {/* Ground ring: its colour says how strong they are next to you */}
      {picked && (
        <span
          className={clsx("absolute rounded-[50%] border-2 animate-ping", ring)}
          style={{ left: VX - half + 1, top: foot - 6, width: size - 2, height: 11 }}
        />
      )}
      <span
        className={clsx("absolute rounded-[50%] border-[1.5px]", ring)}
        style={{ left: VX - half + 1, top: foot - 6, width: size - 2, height: 11 }}
      />
      <Image
        draggable={false}
        alt=""
        className="absolute object-contain drop-shadow-[0_3px_2px_rgba(0,0,0,0.6)]"
        height={104}
        src={buildingImage(BUILDING_BY_ID["town-hall"])}
        style={{ left: VX - half, top: foot - size + 3, width: size, height: size }}
        width={104}
      />
      {/* Town Hall level: a small coin tucked at the village's foot */}
      {loud && (
        <span
          className="absolute w-4 h-4 rounded-full border-[1.5px] border-[#F7D58A] bg-gradient-to-b from-[#F6CC72] to-[#C98C2E] text-[#1A120B] font-display text-[8.5px] font-black leading-none flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
          style={{ left: VX - half - 5, top: foot - 12 }}
        >
          {t.townHall}
        </span>
      )}
      {/* Shield: full size with the labels, a small faint mark otherwise */}
      {shielded && !t.isMe && (
        <span
          className={clsx(
            "absolute leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]",
            loud ? "text-[13px]" : "text-[9px] opacity-75",
          )}
          style={{ left: VX + half - (loud ? 9 : 7), top: foot - size + (loud ? 1 : 5) }}
        >
          <GameIcon e="🛡️" />
        </span>
      )}
      {t.clan && (
        <span
          className="absolute drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
          style={{ left: VX - half - 4, top: foot - size - 2 }}
        >
          <ClanFlag flag={t.clan.flag} size={loud ? 16 : 12} title={`[${t.clan.tag}]`} />
        </span>
      )}
      {/* Name plate */}
      {loud && (
        <span
          className={clsx(
            "absolute left-1/2 -translate-x-1/2 max-w-[104px] truncate px-1.5 h-[15px] leading-[13px] rounded-[5px] border font-display text-[9px] font-bold tracking-[0.02em] shadow-[0_2px_3px_rgba(0,0,0,0.6)]",
            t.isMe
              ? "bg-gradient-to-b from-[#F6CC72] to-[#C98C2E] text-[#1A120B] border-[#F7D58A]"
              : t.ally
                ? "bg-ink/90 text-sea border-sea/60"
                : "bg-ink/90 text-parch border-frame",
          )}
          style={{ top: foot + 6 }}
        >
          {t.isMe ? "You" : t.clan ? `[${t.clan.tag}] ${t.name}` : t.name}
        </span>
      )}
    </button>
  );
});

// ─── The map ─────────────────────────────────────────────────────────────────

export const WarMap = ({
  onAttack,
  onBattleDone,
  focusId,
  focusCamp,
}: {
  onAttack: (t: AttackTarget) => void;
  onBattleDone: (r: BattleReport) => void;
  focusId?: number;
  /** Open on this barbarian camp (by level) with its card up. */
  focusCamp?: number;
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
  // The on-the-move list starts folded so it doesn't cover the map; its header shows what's coming.
  const [movesOpen, setMovesOpen] = useState(false);
  const [worldOpen, setWorldOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const fill = useFillHeight(box);
  const radius = useRef(0);
  const outgoing = useRef<Set<number>>(new Set());
  const centred = useRef(false);
  const goods = useRef<Set<string>>(new Set());
  // The middle of the loaded area once the player has travelled (null: your
  // tribe, or the tribe you came to see). Only the newest answer is used, so a
  // slow poll can't snap the map back to where it was.
  const centre = useRef<{ x: number; y: number } | null>(null);
  const asked = useRef(0);
  // A spot to glide to as soon as the area round it has loaded.
  const flyTo = useRef<{ x: number; y: number } | null>(null);

  const load = useCallback(async () => {
    if (!authHeader) return;
    const ask = ++asked.current;

    try {
      const r = (radius.current = Math.max(radius.current, wantedRadius(box.current)));
      const c = centre.current && keepInWorld(centre.current, r);
      const d = await apiRequest<MapData>(
        authHeader,
        `war/map?r=${r}` + (c ? `&x=${c.x}&y=${c.y}` : focusId ? `&focus=${focusId}` : ""),
      );

      if (ask !== asked.current) return;
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
  const tripOf = (from: Pt, to: Pt, units: Army | null) => tripFor(from, to, units, px, py, `${ox},${oy}`);
  const roadOf = (from: Pt, to: Pt, units: Army | null, f: number): { road: Road; atSea: boolean } => {
    const t = tripOf(from, to, units);

    return { road: t.road, atSea: pointAlong(t.r, t.stops, f).atSea };
  };

  // ─── Camera: drag, pinch, wheel and the +/− buttons (see useMapCamera) ────
  const grown = useRef(0);
  // The tiles on screen when the camera last came to rest: the land is drawn
  // in pieces round them (and, zoomed in close, again at full detail).
  const [view, setView] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // The zoom the camera last came to rest at: labels shrink less than the land,
  // so how crowded the map looks depends on it.
  const [restZoom, setRestZoom] = useState(1);
  // An area round a new spot is on its way: no other is asked for until it
  // lands. Asking again on every move threw each answer away for the next,
  // so while you kept dragging nothing ever arrived.
  const edgeLoading = useRef(false);

  /** The tiles on screen for camera (x, y, z), or null before the map is laid out. */
  const tilesOnScreen = (x: number, y: number, z: number) => {
    const el = camera.viewport.current;

    if (!el || !n) return null;

    return {
      x0: Math.floor(ox - x / z / T),
      y0: Math.floor(oy - y / z / T),
      x1: Math.ceil(ox + (el.clientWidth - x) / z / T),
      y1: Math.ceil(oy + (el.clientHeight - y) / z / T),
    };
  };

  /**
   * Close to the edge of what's loaded (and there's more world that way):
   * load the area round the middle of the screen.
   */
  const loadIfNearEdge = (next: { x0: number; y0: number; x1: number; y1: number }) => {
    const nearEdge =
      (next.x0 < ox + EDGE && ox > MAP_MIN) ||
      (next.y0 < oy + EDGE && oy > MAP_MIN) ||
      (next.x1 > ox + n - EDGE && ox + n < MAP_MAX) ||
      (next.y1 > oy + n - EDGE && oy + n < MAP_MAX);

    if (!nearEdge || edgeLoading.current) return;
    const want = keepInWorld({ x: (next.x0 + next.x1) / 2, y: (next.y0 + next.y1) / 2 }, radius.current);
    const was = centre.current ?? data?.center;

    if (!was || was.x !== want.x || was.y !== want.y) {
      centre.current = want;
      edgeLoading.current = true;
      load().finally(() => {
        edgeLoading.current = false;
      });
    }
  };

  const camera = useMapCamera({
    size: n * T,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    onSettle: ({ x, y, z }) => {
      setRestZoom(Math.round(z * 20) / 20);
      const next = tilesOnScreen(x, y, z);

      if (!next) return;
      setView((v) =>
        v && v.x0 === next.x0 && v.y0 === next.y0 && v.x1 === next.x1 && v.y1 === next.y1 ? v : next,
      );
      loadIfNearEdge(next);
    },
    // Mid-drag too: the next area loads before the map runs out under the
    // finger, not only once it comes to rest against the edge.
    onMove: ({ x, y, z }) => {
      const next = tilesOnScreen(x, y, z);

      if (next) loadIfNearEdge(next);
    },
    // A bigger window: load more of the world if it no longer fills it.
    onResize: () => {
      if (wantedRadius(box.current) > radius.current && Date.now() - grown.current > 1000) {
        grown.current = Date.now();
        load();
      }
    },
  });

  // A bigger window loads a bigger area: keep the same spot in view.
  const origin = useRef<{ ox: number; oy: number } | null>(null);

  useLayoutEffect(() => {
    const o = origin.current;

    if (!data) return;
    if (o && (o.ox !== ox || o.oy !== oy)) camera.shift((o.ox - ox) * T, (o.oy - oy) * T);
    else camera.refit();
    origin.current = { ox, oy };
  }, [data, ox, oy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start centred on your tribe (or the one you came to take revenge on, or
  // the barbarian camp you came to raid).
  useLayoutEffect(() => {
    if (!data || centred.current || !camera.viewport.current) return;
    const camp = focusCamp ? data.camps.find((c) => c.level === focusCamp) : undefined;

    if (camp) {
      const loaded = camp.x >= ox && camp.y >= oy && camp.x < ox + n && camp.y < oy + n;

      // Far off: start at home and glide there once the area round it loads.
      camera.centerOn(px(loaded ? camp.x : data.home.x), py(loaded ? camp.y : data.home.y), { z: 1, instant: true });
      centred.current = true;
      setSelected({ kind: "camp", camp });
      if (!loaded) goTo(camp);

      return;
    }
    const focus =
      (focusId && data.tribes.find((t) => t.id === focusId)) || data.home;

    camera.centerOn(px(focus.x), py(focus.y), { z: 1, instant: true });
    centred.current = true;
    if (focusId) {
      const t = data.tribes.find((x) => x.id === focusId);

      if (t) setSelected({ kind: "tribe", tribe: t });
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // A far spot was asked for: once the area round it has loaded, glide there.
  useLayoutEffect(() => {
    const f = flyTo.current;

    if (!data || !f || f.x < ox || f.y < oy || f.x >= ox + n || f.y >= oy + n) return;
    flyTo.current = null;
    camera.centerOn(px(f.x), py(f.y));
  }, [data, ox, oy]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Go to any tile in the world, loading the area round it first if it's far. */
  const goTo = (p: { x: number; y: number }) => {
    if (!data) return;
    const t = {
      x: Math.min(MAP_MAX - 1, Math.max(MAP_MIN, Math.round(p.x))),
      y: Math.min(MAP_MAX - 1, Math.max(MAP_MIN, Math.round(p.y))),
    };
    // Well inside what's loaded (or against the world's edge): just glide.
    const inside = (v: number, o: number) =>
      v >= (o === MAP_MIN ? o : o + EDGE) && v < (o + n === MAP_MAX ? o + n : o + n - EDGE);

    if (inside(t.x, ox) && inside(t.y, oy)) {
      flyTo.current = null;
      camera.centerOn(px(t.x), py(t.y));

      return;
    }
    centre.current = keepInWorld(t, radius.current);
    flyTo.current = t;
    load();
  };

  const recentre = () => {
    if (data) goTo(data.home);
  };

  // Tiles with something standing on them: the ground leaves them clear.
  const occupied = useMemo(
    () => (data ? [...data.tribes.map((t) => ({ x: t.x, y: t.y })), ...data.camps.map((c) => ({ x: c.x, y: c.y }))] : []),
    [data],
  );
  // Your tribe: the ground draws your territory round it.
  const homeX = data?.home.x;
  const homeY = data?.home.y;

  // The land as square pieces lined up on the world grid: those on screen and
  // a margin round them, plus full-detail pieces on screen when zoomed in. A
  // piece is only told about what stands on it, so it repaints only when that changes.
  const ground = useMemo(() => {
    if (!view || !n || homeX == null || homeY == null) return [];
    const out: { key: string; x: number; y: number; n: number; detail: boolean; res: number; occupied: string; home: string; prio: number }[] = [];
    const mx = (view.x0 + view.x1) / 2;
    const my = (view.y0 + view.y1) / 2;
    // `margin`: tiles past the screen's edge to have ready before a drag shows them.
    const add = (size: number, detail: boolean, res: number, margin: number) => {
      const lo = (v: number) => Math.floor(v / size) * size;
      const x1 = Math.min(ox + n, view.x1 + margin);
      const y1 = Math.min(oy + n, view.y1 + margin);

      for (let y = lo(Math.max(oy, view.y0 - margin)); y < y1; y += size)
        for (let x = lo(Math.max(ox, view.x0 - margin)); x < x1; x += size) {
          const on = occupied
            .filter((p) => p.x >= x - 1 && p.x <= x + size && p.y >= y - 1 && p.y <= y + size)
            .map((p) => `${p.x},${p.y}`)
            .sort()
            .join(";");
          // Your territory reaches about four tiles out.
          const near = homeX >= x - 4 && homeX < x + size + 4 && homeY >= y - 4 && homeY < y + size + 4;

          out.push({
            key: `${detail ? "d" : "b"}${x},${y}`,
            x,
            y,
            n: size,
            detail,
            res,
            occupied: on,
            home: near ? `${homeX},${homeY}` : "",
            prio: Math.hypot(x + size / 2 - mx, y + size / 2 - my) + (detail ? 12 : 0),
          });
        }
    };

    // A few tiles round the screen, not a whole ring of pieces: every piece on
    // the page is a decoded picture the phone must hold, and one that runs out
    // of room drops parts of the screen (see baseRes in MapGround).
    add(CHUNK, false, baseRes(), 4);
    // Zoomed in: the pieces on screen again, only as sharp as this zoom needs.
    const close = closeUpRes(restZoom);

    if (close) add(DETAIL_CHUNK, true, close, 0);

    return out;
  }, [view, n, ox, oy, occupied, homeX, homeY, restZoom]);

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

  // Crowded spots: a traveller standing on a village or camp, or on top of
  // another traveller, drops its label so names and timers don't pile up.
  // Armies keep theirs first, then merchants. (The list above still has it all.)
  const quiet = new Set<string>();

  if (data) {
    // Labels sit under their token and shrink less than the land when you zoom out.
    const near = 1.05 * T * pinScale(restZoom);
    const taken: { x: number; y: number }[] = [
      ...data.tribes.map((t) => ({ x: px(t.x), y: py(t.y) })),
      ...data.camps.map((c) => ({ x: px(c.x), y: py(c.y) })),
      ...battles.map((m) => ({ x: px(m.to.x), y: py(m.to.y) })),
    ];
    const place = (key: string, at: { x: number; y: number }) => {
      if (taken.some((q) => Math.hypot(q.x - at.x, q.y - at.y) < near)) quiet.add(key);
      taken.push(at);
    };
    const spot = (from: { x: number; y: number }, to: { x: number; y: number }, units: Army | null, f: number) =>
      spotOnRoad({ x: px(from.x), y: py(from.y) }, { x: px(to.x), y: py(to.y) }, roadOf(from, to, units, f).road, f);

    for (const m of marching) place(`t${m.id}`, spot(m.from, m.to, m.units, progress(now, m.sentAt, m.arrivesAt)));
    for (const m of homeward) place(`b${m.id}`, spot(m.from, data.home, m.units, progress(now, m.leftAt, m.returnsAt)));
    for (const c of data.caravans ?? [])
      if (c.arrivesAt > now) place(`c${c.id}`, spot(c.from, c.to, null, progress(now, c.sentAt, c.arrivesAt)));
  }

  // Zoomed out, labels stay quiet: everyone's names only from LABELS_ZOOM up.
  const labelsAll = restZoom >= LABELS_ZOOM;
  // Villages you're dealing with right now (armies or your merchants on the way) keep their names.
  const atWar = new Set<string>(
    data
      ? [
          ...data.movements.flatMap((m) => [`${Math.round(m.from.x)},${Math.round(m.from.y)}`, `${m.to.x},${m.to.y}`]),
          ...(data.caravans ?? [])
            .filter((c) => c.kind !== "other")
            .flatMap((c) => [`${c.from.x},${c.from.y}`, `${c.to.x},${c.to.y}`]),
        ]
      : [],
  );

  const onTheMove = battles.length + incoming.length + mine.length + returning.length + merchants.length;

  // The roads your armies, the armies coming for you and your merchants are on.
  const paths: TravelPath[] = data
    ? [
        ...homeward.map((m) => ({ key: `b${m.id}`, kind: "homeward" as PathKind, runs: tripOf(m.from, data.home, m.units).runs })),
        ...marching.map((m) => ({
          key: `t${m.id}`,
          kind: (m.kind === "incoming" ? "incoming" : "army") as PathKind,
          runs: tripOf(m.from, m.to, m.units).runs,
        })),
        // Merchants last: their thin dashed trail stays visible where it shares a road with an army.
        ...merchants.map((c) => ({
          key: `c${c.id}`,
          kind: (c.kind === "coming" ? "goods-coming" : "goods-going") as PathKind,
          runs: tripOf(c.from, c.to, null).runs,
        })),
      ]
    : [];
  // A sheet is open over the map.
  const covered = !!selected || watching != null || !!ordersFor || !!redirecting || worldOpen;

  return (
    <div className="flex flex-col gap-2">
      {/* The map */}
      <div
        ref={box}
        className="relative rounded-2xl overflow-hidden border border-frame/80 h-[max(320px,calc(100svh-260px))] bg-[#1C3F54] shadow-card"
        style={fill ? { height: fill } : undefined}
      >
        {!data && !error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted font-display">
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
            ref={camera.viewport}
            data-covered={covered ? "" : undefined}
            className="map-viewport absolute inset-0 overflow-hidden select-none cursor-grab data-[dragging]:cursor-grabbing"
          >
            <div
              ref={camera.layer}
              className="absolute left-0 top-0 origin-top-left will-change-transform"
              style={{ width: n * T, height: n * T }}
            >
              <GroundOverview n={n} ox={ox} oy={oy} />
              {ground.map((p) => (
                <GroundPiece
                  key={p.key}
                  detail={p.detail}
                  home={p.home}
                  res={p.res}
                  left={(p.x - ox) * T}
                  n={p.n}
                  occupied={p.occupied}
                  prio={p.prio}
                  top={(p.y - oy) * T}
                  x={p.x}
                  y={p.y}
                />
              ))}

              {/* Roads armies and merchants are on */}
              <TravelPaths paths={paths} size={n * T} />

              {/* Barbarian camps */}
              {data.camps.map((c) => {
                const picked = selected?.kind === "camp" && selected.camp.level === c.level;

                return (
                  <CampMarker
                    key={`c${c.level}`}
                    c={c}
                    labelsAll={labelsAll}
                    left={px(c.x)}
                    picked={picked}
                    timer={c.state === "cooldown" && (labelsAll || picked) ? formatDuration(c.readyAt - now) : undefined}
                    top={py(c.y)}
                    onPick={setSelected}
                  />
                );
              })}

              {/* Tribes */}
              {data.tribes.map((t) => {
                const picked = selected?.kind === "tribe" && selected.tribe.id === t.id;

                return (
                  <Village
                    key={t.id}
                    left={px(t.x)}
                    // Full labels zoomed in; zoomed out only for you, your clan, the
                    // village you picked and anyone you're dealing with now.
                    loud={labelsAll || t.isMe || t.ally || picked || atWar.has(`${t.x},${t.y}`)}
                    picked={picked}
                    shielded={t.shieldUntil > now}
                    strength={strength(t.power)}
                    t={t}
                    top={py(t.y)}
                    onPick={setSelected}
                  />
                );
              })}

              {/* Caravans and armies on the road. Keyed on the loaded area too: a
                  new area moves every token's px by a whole area at once, and the
                  camera makes up for it instantly, but the tokens' one-second glide
                  would slide them across the map from the wrong spot. A new token
                  starts where it belongs. */}
              {(data.caravans ?? [])
                .filter((c) => c.arrivesAt > now)
                .map((c) => (
                  <CaravanToken
                    key={`${ox},${oy}t${c.id}`}
                    amount={c.amount}
                    from={{ x: px(c.from.x), y: py(c.from.y) }}
                    kind={c.kind}
                    left={c.arrivesAt - now}
                    p={progress(now, c.sentAt, c.arrivesAt)}
                    quiet={quiet.has(`c${c.id}`)}
                    resource={c.resource}
                    road={roadOf(c.from, c.to, null, progress(now, c.sentAt, c.arrivesAt)).road}
                    to={{ x: px(c.to.x), y: py(c.to.y) }}
                  />
                ))}
              {homeward.map((m) => {
                const f = progress(now, m.leftAt, m.returnsAt);
                const { road, atSea } = roadOf(m.from, data.home, m.units, f);

                return (
                  <ArmyToken
                    key={`${ox},${oy}b${m.id}`}
                    atSea={atSea}
                    from={{ x: px(m.from.x), y: py(m.from.y) }}
                    incoming={false}
                    left={Math.max(0, m.returnsAt - now)}
                    p={f}
                    quiet={quiet.has(`b${m.id}`)}
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
                    key={`${ox},${oy}t${m.id}`}
                    atSea={atSea}
                    from={{ x: px(m.from.x), y: py(m.from.y) }}
                    incoming={m.kind === "incoming"}
                    left={Math.max(0, m.arrivesAt - now)}
                    p={f}
                    quiet={quiet.has(`t${m.id}`)}
                    road={road}
                    to={{ x: px(m.to.x), y: py(m.to.y) }}
                    units={m.units}
                    onClick={m.kind === "outgoing" ? () => setOrdersFor(outbound(m)) : undefined}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Frame: a soft vignette and a gold hairline, like a map under glass */}
        <div className="pointer-events-none absolute inset-0 z-[5] rounded-2xl shadow-[inset_0_0_42px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-gold/20" />

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
          <div className="absolute right-2 bottom-2 z-10 flex flex-col items-center gap-2">
            <button
              aria-label="The world"
              className="w-11 h-11 rounded-full border border-frame bg-gradient-to-b from-[#3A2B1E]/95 to-[#1E1610]/95 shadow-raised flex items-center justify-center active:scale-95 transition-transform"
              onClick={() => setWorldOpen(true)}
            >
              <Image draggable={false} alt="" className="w-7 h-7 object-contain" height={64} src="/images/icons/compass.webp" width={64} />
            </button>
            <button
              aria-label="Back to my tribe"
              className="w-11 h-11 rounded-full border-2 border-gold bg-ink/85 shadow-[0_0_12px_rgba(227,169,72,0.55),0_4px_10px_rgba(0,0,0,0.6)] flex items-center justify-center active:scale-95 transition-transform"
              onClick={recentre}
            >
              <Image
                draggable={false}
                alt=""
                className="w-8 h-8 object-contain"
                height={64}
                src={buildingImage(BUILDING_BY_ID["town-hall"])}
                width={64}
              />
            </button>
            <div className="flex flex-col items-center rounded-xl border border-frame bg-gradient-to-b from-[#3A2B1E]/95 to-[#1E1610]/95 shadow-raised overflow-hidden">
              <button
                aria-label="Zoom in"
                className="w-11 h-11 flex items-center justify-center font-display text-2xl leading-none text-goldtext active:bg-gold/15"
                onClick={() => camera.zoomBy(1.5)}
              >
                +
              </button>
              <span className="h-px w-7 bg-line" />
              <button
                aria-label="Zoom out"
                className="w-11 h-11 flex items-center justify-center font-display text-2xl leading-none text-goldtext active:bg-gold/15"
                onClick={() => camera.zoomBy(1 / 1.5)}
              >
                −
              </button>
            </div>
          </div>
        )}
        {/* Armies, battles and merchants on the move: on the map, so they never push it off the screen */}
        {data && onTheMove > 0 && (
          <div className="absolute inset-x-2 top-2 z-10 sm:right-auto sm:w-[26rem] flex flex-col gap-1.5 rounded-xl border border-frame/80 bg-ink/85 backdrop-blur-[2px] p-1.5 shadow-card">
            <button
              aria-expanded={movesOpen}
              className="flex items-center gap-2 px-1.5 h-7 text-left font-display text-[12px] font-black tracking-[0.03em] text-goldtext"
              onClick={() => setMovesOpen((o) => !o)}
            >
              {incoming.length > 0 && <span className="text-[#FFB27A] animate-pulse"><GameIcon e="🔥" /> {incoming.length} incoming</span>}
              {battles.length > 0 && <span className="text-[#FFB27A]"><GameIcon e="⚔️" /> {battles.length} fighting</span>}
              {mine.length + returning.length > 0 && (
                <span className="text-parch"><GameIcon e="🚩" /> {mine.length + returning.length} on the road</span>
              )}
              {merchants.length > 0 && <span className="text-sub"><GameIcon e="🐪" /> {merchants.length}</span>}
              <span className={clsx("ml-auto text-sub transition-transform", movesOpen && "rotate-180")}>▾</span>
            </button>
            {movesOpen && (
              <div className="map-list flex flex-col gap-1.5 max-h-[30svh] overflow-y-auto overscroll-contain">
      {battles.map((m) => (
                <BattleRow key={`f${m.id}`} m={m} now={now} onWatch={() => setWatching(m.id)} />
              ))}
              {incoming.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 bg-[#2A140E] border border-[#8A3B23] text-sm"
                >
                  <span className="text-base animate-pulse"><GameIcon e="🔥" /></span>
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
                  className="flex items-center gap-2 card px-2.5 py-1.5 !border-gold/60 text-sm"
                >
                  <span className="text-base"><GameIcon e="⚔️" /></span>
                  <span className="flex-1 min-w-0 truncate">
                    To <b>{m.to.name}</b>
                    {/* Not truncated: a whole army too wide for one line showed as "…". */}
                    <span className="block text-xs text-muted">
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
                  className="flex items-center gap-2 card px-2.5 py-1.5 text-sm"
                >
                  <span className="text-base">↩️</span>
                  <span className="flex-1 min-w-0 truncate">
                    Back from <b>{m.target}</b>
                    <span className="block text-xs text-muted">
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
                    "flex items-center gap-2 card px-2.5 py-1.5 text-sm",
                    c.kind === "coming" ? "border-[#5E7F45]" : "border-line",
                  )}
                >
                  <span className="text-base"><GameIcon e="🐪" /></span>
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
          </div>
        )}
        <div
          className={clsx(
            "absolute left-2 bottom-2 z-10 flex items-center gap-2 rounded-xl border border-frame/80 bg-ink/80 pl-2.5 pr-1 py-1 shadow-card",
            picking && "hidden",
          )}
        >
          <span className="flex items-center gap-2 text-[11px] font-bold text-sub">
            <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-[50%] border border-good bg-good/30" />weaker</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-[50%] border border-goldtext bg-goldtext/20" />even</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-[50%] border border-bad bg-bad/30" />stronger</span>
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
                  <GameIcon e="🚩" /> The road each army is on is drawn on the map: gold for yours, red for one
                  coming for you, dotted where they sail. Your merchants' trails are dashed, green when goods
                  are coming home.
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
                <span>
                  Drag to move around: more of the world loads as you go. Pinch, scroll or double-tap to zoom.
                  The compass opens the whole world: tap a spot or type its x|y to go there.
                </span>
              </span>
            }
            title="War on the map"
          />
        </div>
      </div>

      {data && (
        <WorldMap home={data.home} open={worldOpen} view={view} onClose={() => setWorldOpen(false)} onGo={goTo} />
      )}

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
