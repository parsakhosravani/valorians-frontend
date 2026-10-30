"use client";

import clsx from "clsx";
import { CSSProperties, FunctionComponent, memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Plot, claimOutline, villagePlan } from "./villagePlan";

import { CHUNK, DETAIL_CHUNK, GroundOverview, GroundPiece, TILE, baseRes, closeUpRes } from "@/components/organisms/war/MapGround";
import { CanvasTribe, MapCanvas, MapPainter, VILLAGE_GROW, VILLAGE_MIN } from "@/components/organisms/war/MapCanvas";
import { useMapCamera } from "@/components/organisms/war/useMapCamera";
import type { MapData } from "@/components/organisms/war/WarMap";
import { Button } from "@/components/atoms/Button";
import { useGameStatus } from "@/context";
import { apiRequest } from "@/lib/api";
import { BuildingDef, buildingImage } from "@/lib/game/config";
import { Point, terrainAt } from "@/lib/game/map";
import { UpgradeOption, canStart } from "@/lib/game/advice";
import { formatDuration } from "@/lib/format";

/**
 * Your village, up close on your own land: the war map's ground round your
 * tribe, the gold border of your territory, and every building standing on
 * it where the land suits it (see villagePlan). Pinch, drag and double-tap
 * like the war map; tap a building to open it.
 *
 * The ground is painted and drawn exactly as on the war map (land pieces from
 * the ground worker onto MapCanvas, moved by useMapCamera); the buildings are
 * page elements on the camera's layer, so they stay buttons. Their name
 * plates keep one size on screen at any zoom, and only as many show as fit
 * without covering each other: zooming in names them all.
 */

const T = TILE;
/** Tiles shown either side of your tile: your land and a little of your neighbours'. */
const R = 6;
const SIDE = (2 * R + 1) * T;
/** A building's width on the ground (px at zoom 1); a few landmarks are bigger. */
const SIZE = 40;
const BIG: Record<string, number> = { "town-hall": 1.5, "city-gate": 1.15, watchtower: 1.1 };
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 3.6;

// ─── Your land ───────────────────────────────────────────────────────────────

type Land = { home: Point; neighbours: MapData["tribes"]; myPower: number };

/** Kept for the session: your tile doesn't move, and neighbours rarely do. */
let landCache: Land | null = null;

/** Your tile and the tribes round it, from the war map's own request (it also settles a new tribe). */
const useLand = () => {
  const { authHeader } = useGameStatus();
  const [land, setLand] = useState(landCache);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (landCache || !authHeader) return;
    let live = true;

    apiRequest<MapData>(authHeader, "war/map?r=8")
      .then((d) => {
        landCache = { home: d.home, neighbours: d.tribes.filter((t) => !t.isMe), myPower: d.myPower };
        if (live) setLand(landCache);
      })
      .catch((e: Error) => live && setError(e.message));

    return () => {
      live = false;
    };
  }, [authHeader, tries]);

  return {
    land,
    error,
    retry: () => {
      setError(null);
      setTries((n) => n + 1);
    },
  };
};

// ─── Buildings ───────────────────────────────────────────────────────────────

/**
 * The "upgrade now" mark: a green gem with a gold rim and a raised double
 * chevron, gently bobbing so ready buildings catch the eye.
 */
const UpgradeMark = ({ className, style }: { className?: string; style?: CSSProperties }) => {
  const id = useId().replace(/:/g, "");

  return (
    <svg aria-hidden="true" className={clsx("animate-nudge drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]", className)} style={style} viewBox="0 0 24 24">
      <defs>
        <radialGradient cx="38%" cy="30%" id={`${id}-gem`} r="75%">
          <stop offset="0" stopColor="#D8F5B8" />
          <stop offset="0.45" stopColor="#6FB548" />
          <stop offset="1" stopColor="#2E5A1C" />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#FBE3A6" />
          <stop offset="1" stopColor="#9A6A26" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" fill={`url(#${id}-rim)`} r="11.5" />
      <circle cx="12" cy="12" fill={`url(#${id}-gem)`} r="9.6" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.5 12.2 12 7.7l4.5 4.5M7.5 16.6 12 12.1l4.5 4.5" stroke="#1C3410" strokeWidth="4" />
        <path d="M7.5 12.2 12 7.7l4.5 4.5M7.5 16.6 12 12.1l4.5 4.5" stroke="#FFFBEA" strokeWidth="2.2" />
      </g>
      <ellipse cx="9" cy="6.6" fill="#fff" opacity="0.35" rx="3.2" ry="1.4" transform="rotate(-25 9 6.6)" />
    </svg>
  );
};

/**
 * Something that keeps one size on screen at any zoom, pinned to a point on
 * the ground: the camera's layer carries the zoom in --vz (set when the
 * camera comes to rest), and this undoes it round the point.
 */
const OnScreen = ({ x, y, z, children }: { x: number; y: number; z: number; children: React.ReactNode }) => (
  <div className="absolute w-0 h-0 pointer-events-none" style={{ left: x, top: y, zIndex: z, scale: "calc(1 / var(--vz, 1))", transformOrigin: "0 0" }}>
    {children}
  </div>
);

type PlotProps = {
  o: UpgradeOption;
  at: Point;
  freeBuilder: boolean;
  now: number;
  named: boolean;
  onOpen: (b: BuildingDef) => void;
};

/** A building on its plot: the art (zooms with the land), a level medallion and name at its foot, and what's going on over its roof. */
const Building = memo(function Building({ o, at, freeBuilder, now, named, onOpen }: PlotProps) {
  const size = SIZE * (BIG[o.building.id] ?? 1);
  const built = o.level > 0;
  const ready = !o.job && freeBuilder && canStart(o);
  // The gem is for upgrading what stands; an empty plot you can build on shows a green "+".
  const gem = ready && built;
  const progress = o.job ? Math.min(1, (now - o.job.startedAt) / (o.job.endsAt - o.job.startedAt)) : 0;
  // Nearer buildings (lower on screen) stand in front.
  const depth = Math.round(at.y * 10);

  return (
    <>
      <button
        aria-label={`${o.building.name}, level ${o.level}${ready ? ", ready to upgrade" : ""}`}
        className="group absolute outline-none"
        style={{ left: at.x - size / 2, top: at.y - size * 0.8, width: size, height: size, zIndex: depth }}
        title={o.building.name}
        type="button"
        onClick={() => onOpen(o.building)}
      >
        {/* The plot: trampled earth under a building, a staked-out patch on an empty one */}
        <span
          className={clsx(
            "absolute left-[6%] right-[6%] bottom-[8%] h-[30%] rounded-[50%]",
            built || o.job
              ? "bg-[radial-gradient(closest-side,rgba(0,0,0,0.5),rgba(0,0,0,0.25)_60%,transparent)]"
              : "bg-[#6B5232]/55 border border-dashed border-goldhi/50",
          )}
        />
        <img
          alt=""
          className={clsx(
            "relative w-full h-full object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] transition-[transform,filter,opacity] duration-200",
            "group-hover:-translate-y-[3%] group-hover:brightness-110 group-active:scale-95 group-focus-visible:brightness-125",
            !built && !o.job && "opacity-45 grayscale-[0.9] brightness-75 group-hover:opacity-75",
          )}
          draggable={false}
          src={buildingImage(o.building)}
        />
      </button>

      {/* Over the roof: ready to upgrade, or the work under way */}
      {(gem || o.job) && (
        <OnScreen x={at.x} y={at.y - size * 0.72} z={20000 + depth}>
          <div className="absolute left-0 bottom-0 -translate-x-1/2 flex flex-col items-center gap-0.5">
            {o.job ? (
              <>
                <span className="px-1.5 rounded bg-[#1A120B]/90 border border-gold/40 text-[10px] leading-[14px] font-bold text-goldtext whitespace-nowrap">
                  {formatDuration(o.job.endsAt - now)}
                </span>
                <span className="w-10 h-1.5 rounded-full bg-[#1A120B]/90 border border-black/40 overflow-hidden">
                  <span className="block h-full bg-gradient-to-r from-gold to-ember" style={{ width: `${progress * 100}%` }} />
                </span>
              </>
            ) : (
              <UpgradeMark className="w-[18px] h-[18px]" />
            )}
          </div>
        </OnScreen>
      )}

      {/* At its foot: the level, and the name when there's room for it */}
      <OnScreen x={at.x} y={at.y + 1} z={10000 + depth}>
        <button
          aria-hidden="true"
          className={clsx(
            "absolute left-0 top-0 -translate-x-1/2 pointer-events-auto flex items-center gap-1 py-0.5 rounded-full border text-[11px] whitespace-nowrap",
            "bg-[#1A120B]/85 shadow-[0_1px_4px_rgba(0,0,0,0.7)] transition-colors hover:border-gold",
            named ? "pl-0.5 pr-2" : "px-0.5",
            ready ? "border-good/80" : o.job ? "border-gold/70" : built ? "border-frame" : "border-line/60 border-dashed",
          )}
          tabIndex={-1}
          type="button"
          onClick={() => onOpen(o.building)}
        >
          <span
            className={clsx(
              "shrink-0 w-[18px] h-[18px] rounded-full border flex items-center justify-center font-display font-black leading-none text-[10px]",
              built
                ? "bg-gradient-to-b from-goldhi to-gold text-[#1A120B] border-[#FBE3A6]"
                : ready
                  ? "bg-good/25 text-good border-good/80"
                  : "bg-panel2 text-muted border-line",
            )}
          >
            {o.maxed ? "★" : built ? o.level : "+"}
          </span>
          {named && <span className={clsx("font-bold leading-none", built || o.job ? "text-parch" : "text-muted")}>{o.building.name}</span>}
        </button>
      </OnScreen>
    </>
  );
});

/** Rough size of a name plate on screen (px), for deciding which fit. */
const plateSize = (name: string, named: boolean) => ({ w: named ? 30 + name.length * 6.2 : 22, h: 22 });

// ─── The village ─────────────────────────────────────────────────────────────

type Cam = { x: number; y: number; z: number };

const VillageLand = ({ land, options, freeBuilder, now, onOpen }: { land: Land } & VillageProps) => {
  const { home, neighbours, myPower } = land;
  // The box shown: your tile in the middle, R tiles either side. All positions are px in it at zoom 1.
  const ox = home.x - R;
  const oy = home.y - R;
  const mid = R * T + T / 2;
  const toPx = (p: Plot): Point => ({ x: mid + p.x * T, y: mid + p.y * T });
  const tilePx = (x: number, y: number): Point => ({ x: (x - ox) * T + T / 2, y: (y - oy) * T + T / 2 });

  const ids = options.map((o) => o.building.id).sort().join(",");
  const plan = useMemo(
    () => villagePlan(home, ids.split(","), terrainAt, neighbours.map((t) => ({ x: t.x, y: t.y }))),
    [home, ids, neighbours],
  );

  const painter = useRef<MapPainter | null>(null);
  const [rest, setRest] = useState<Cam | null>(null);
  const camera = useMapCamera({
    size: SIDE,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    onDraw: (c) => painter.current?.setCamera(c),
    onSettle: (c) => {
      camera.layer.current?.style.setProperty("--vz", String(c.z));
      setRest((r) => (r && r.x === c.x && r.y === c.y && r.z === c.z ? r : { ...c }));
    },
  });

  // Start on the Town Hall, with your whole territory in view.
  useLayoutEffect(() => {
    const v = camera.size();

    if (!v) return;
    // Close enough that the buildings read well; the edges of your land are a short drag away.
    const z = Math.min(2.2, Math.max(1.1, Math.min(v.w, v.h) / (5.4 * T)));

    camera.centerOn(mid, mid, { z, instant: true });
    const c = camera.get();

    camera.layer.current?.style.setProperty("--vz", String(c.z));
    painter.current?.setCamera(c);
    setRest({ ...c });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tiles with something on them: the ground clears them (trodden earth, no trees).
  const occupied = useMemo(() => {
    const keys = new Set<string>();

    for (const t of neighbours) keys.add(`${t.x},${t.y}`);
    for (const p of Object.values(plan.plots)) keys.add(`${Math.round(home.x + p.x)},${Math.round(home.y + p.y)}`);

    return Array.from(keys).map((k) => k.split(",").map(Number) as [number, number]);
  }, [neighbours, plan, home]);

  // The land in pieces lined up on the world grid, as on the war map: the
  // whole box at the whole-view sharpness, and on screen again as sharp as
  // the zoom needs.
  const ground = useMemo(() => {
    const out: { key: string; x: number; y: number; n: number; detail: boolean; res: number; occupied: string; prio: number }[] = [];
    const add = (size: number, detail: boolean, res: number, x0: number, y0: number, x1: number, y1: number) => {
      for (let y = Math.floor(y0 / size) * size; y < y1; y += size)
        for (let x = Math.floor(x0 / size) * size; x < x1; x += size) {
          const on = occupied
            .filter(([px, py]) => px >= x - 1 && px <= x + size && py >= y - 1 && py <= y + size)
            .map(([px, py]) => `${px},${py}`)
            .sort()
            .join(";");

          out.push({
            key: `${detail ? "d" : "b"}${x},${y}`,
            x,
            y,
            n: size,
            detail,
            res,
            occupied: on,
            prio: Math.hypot(x + size / 2 - home.x, y + size / 2 - home.y) + (detail ? 12 : 0),
          });
        }
    };

    add(CHUNK, false, baseRes(), ox, oy, ox + 2 * R + 1, oy + 2 * R + 1);
    const close = rest && closeUpRes(rest.z);
    const v = camera.size();

    if (close && rest && v) {
      // Just what's on screen, within the box.
      const x0 = Math.max(ox, ox + Math.floor(-rest.x / rest.z / T));
      const y0 = Math.max(oy, oy + Math.floor(-rest.y / rest.z / T));
      const x1 = Math.min(ox + 2 * R + 1, ox + Math.ceil((v.w - rest.x) / rest.z / T));
      const y1 = Math.min(oy + 2 * R + 1, oy + Math.ceil((v.h - rest.y) / rest.z / T));

      add(DETAIL_CHUNK, true, close, x0, y0, x1, y1);
    }

    return out;
  }, [occupied, rest, ox, oy, home]); // eslint-disable-line react-hooks/exhaustive-deps

  // Your neighbours at the edge of view, drawn as on the war map.
  useEffect(() => {
    const ring = (p: number) => {
      const r = p / Math.max(1, myPower);

      return r < 0.75 ? "weaker" : r > 1.33 ? "stronger" : "even";
    };
    const tribes: CanvasTribe[] = neighbours.map((t) => ({
      id: t.id,
      ...tilePx(t.x, t.y),
      size: Math.round(VILLAGE_MIN + Math.min(VILLAGE_GROW, t.townHall * 0.6)),
      ring: t.ally ? "ally" : ring(t.power),
      island: t.terrain === "sea",
      picked: false,
      loud: false,
      shielded: false,
      isMe: false,
      townHall: t.townHall,
      flag: t.clan?.flag ?? null,
      name: t.name,
    }));

    painter.current?.setMarkers(tribes, []);
  }, [neighbours, myPower]); // eslint-disable-line react-hooks/exhaustive-deps

  // Which buildings are named: as many as fit on screen without covering one
  // another, the ones that matter most first.
  const named = useMemo(() => {
    const out = new Set<string>();

    if (!rest) return out;
    const ready = (o: UpgradeOption) => !o.job && freeBuilder && canStart(o);
    // The Town Hall first, then work under way, upgrades ready, what stands, empty plots.
    const weight = (o: UpgradeOption) =>
      (o.building.id === "town-hall" ? 0 : o.job ? 1 : ready(o) && o.level > 0 ? 2 : o.level > 0 ? 3 : 4) * 100 - o.level;
    const placed = options.filter((o) => plan.plots[o.building.id]);
    const screen = (o: UpgradeOption) => {
      const p = toPx(plan.plots[o.building.id]);

      return { x: rest.x + p.x * rest.z, y: rest.y + (p.y + 1) * rest.z };
    };
    const box = (o: UpgradeOption, withName: boolean) => {
      const s = screen(o);
      const { w, h } = plateSize(o.building.name, withName);

      return { x0: s.x - w / 2 - 2, y0: s.y - 1, x1: s.x + w / 2 + 2, y1: s.y + h + 1 };
    };
    type Box = ReturnType<typeof box>;
    const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    // Everyone's level medallion stays; names go round them, and round the gems and timers over roofs.
    const bare = new Map(placed.map((o) => [o.building.id, box(o, false)]));
    const v = camera.size();
    // A name cut off by the edge of the view doesn't count as shown.
    const inView = (b: Box) => !v || (b.x0 >= 2 && b.x1 <= v.w - 2 && b.y0 >= 2 && b.y1 <= v.h - 2);
    const taken: Box[] = [
      // The zoom buttons in the bottom-right corner.
      ...(v ? [{ x0: v.w - 50, y0: v.h - 128, x1: v.w, y1: v.h }] : []),
      ...placed
        .filter((o) => o.job || (ready(o) && o.level > 0))
      .map((o) => {
        const p = toPx(plan.plots[o.building.id]);
        const s = { x: rest.x + p.x * rest.z, y: rest.y + (p.y - SIZE * (BIG[o.building.id] ?? 1) * 0.72) * rest.z };
        const w = o.job ? 44 : 18;

        return { x0: s.x - w / 2, y0: s.y - (o.job ? 22 : 18), x1: s.x + w / 2, y1: s.y };
      }),
    ];

    for (const o of [...placed].sort((a, b) => weight(a) - weight(b))) {
      const b = box(o, true);

      if (!inView(b) || taken.some((t) => hit(t, b))) continue;
      if (Array.from(bare.entries()).some(([id, m]) => id !== o.building.id && !out.has(id) && hit(m, b))) continue;
      out.add(o.building.id);
      taken.push(b);
    }

    return out;
  }, [rest, options, plan, freeBuilder]); // eslint-disable-line react-hooks/exhaustive-deps

  const border = useMemo(() => claimOutline().map((e) => ({ x: mid + e.x * T, y: mid + e.y * T })), [mid]);
  const borderPath = border.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + "Z";
  // Tracks: a gentle bend each, the same way every time.
  const tracks = plan.tracks.map(([a, b]) => {
    const p = toPx(plan.plots[a]);
    const q = toPx(plan.plots[b]);
    const bend = ((a.length * 7 + b.length * 3) % 5) / 5 - 0.4;
    const cx = (p.x + q.x) / 2 - (q.y - p.y) * bend * 0.25;
    const cy = (p.y + q.y) / 2 + (q.x - p.x) * bend * 0.25;

    return `M${p.x.toFixed(1)} ${p.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
  });
  const hall = toPx(plan.plots["town-hall"]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-frame/80 bg-[#1C3F54] shadow-card h-[clamp(380px,64svh,680px)]">
      {/* isolate: the buildings' labels stack among themselves, never over the zoom buttons */}
      <div ref={camera.viewport} className="map-viewport absolute inset-0 isolate overflow-hidden select-none cursor-grab data-[dragging]:cursor-grabbing">
        <MapCanvas
          onPainter={(p) => {
            painter.current = p;
          }}
        />
        <div ref={camera.layer} className="absolute left-0 top-0 origin-top-left will-change-transform" style={{ width: SIDE, height: SIDE }}>
          <GroundOverview
            n={2 * R + 1}
            ox={ox}
            oy={oy}
            onCanvas={(c) => painter.current?.setBackdrop(c && { canvas: c, left: 0, top: 0, size: SIDE })}
          />
          {ground.map((p) => (
            <GroundPiece
              key={p.key}
              detail={p.detail}
              home={`${home.x},${home.y}`}
              n={p.n}
              occupied={p.occupied}
              prio={p.prio}
              res={p.res}
              x={p.x}
              y={p.y}
              onImage={(img) =>
                painter.current?.setPiece(p.key, img && { img, left: (p.x - ox) * T, top: (p.y - oy) * T, size: p.n * T, detail: p.detail })
              }
            />
          ))}

          <svg aria-hidden="true" className="absolute left-0 top-0 pointer-events-none" height={SIDE} viewBox={`0 0 ${SIDE} ${SIDE}`} width={SIDE}>
            {/* Beyond your border the land is someone else's: dimmed */}
            <path d={`M0 0H${SIDE}V${SIDE}H0Z ${borderPath}`} fill="rgba(14,10,6,0.38)" fillRule="evenodd" />
            {/* Tracks worn between the buildings: a dark bed, then the packed-earth top */}
            <g fill="none" strokeLinecap="round">
              {tracks.map((d, i) => (
                <path key={`b${i}`} d={d} stroke="#4E3A22" strokeOpacity="0.5" strokeWidth="6" />
              ))}
              {tracks.map((d, i) => (
                <path key={`t${i}`} d={d} stroke="#A88A5C" strokeOpacity="0.75" strokeWidth="3.6" />
              ))}
            </g>
            {/* The Town Hall's square */}
            <ellipse cx={hall.x} cy={hall.y - 4} fill="#9A7C52" opacity="0.7" rx={SIZE * 0.95} ry={SIZE * 0.5} stroke="#6E5534" strokeOpacity="0.6" />
          </svg>

          {options.map((o) =>
            plan.plots[o.building.id] ? (
              <Building
                key={o.building.id}
                at={toPx(plan.plots[o.building.id])}
                freeBuilder={freeBuilder}
                named={named.has(o.building.id)}
                now={now}
                o={o}
                onOpen={onOpen}
              />
            ) : null,
          )}
        </div>
      </div>

      {/* Zoom, and back to the Town Hall */}
      <div className="absolute right-2 bottom-2 z-10 flex flex-col rounded-xl overflow-hidden border border-line bg-[#1A120B]/85 shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
        {[
          { label: "Zoom in", text: "+", act: () => camera.zoomBy(1.6) },
          { label: "Zoom out", text: "−", act: () => camera.zoomBy(1 / 1.6) },
          { label: "Back to the Town Hall", text: "⌂", act: () => camera.centerOn(mid, mid) },
        ].map((b) => (
          <button
            key={b.label}
            aria-label={b.label}
            className="w-9 h-9 flex items-center justify-center text-lg font-bold text-parch hover:bg-white/10 border-b border-line last:border-b-0"
            type="button"
            onClick={b.act}
          >
            {b.text}
          </button>
        ))}
      </div>
      {/* A soft vignette ties the edges into the frame */}
      <span className="pointer-events-none absolute inset-0 z-[5] rounded-2xl shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]" />
    </div>
  );
};

type VillageProps = {
  options: UpgradeOption[];
  freeBuilder: boolean;
  now: number;
  onOpen: (b: BuildingDef) => void;
};

/** The tribe as a village on its own land: every building on its own plot. Tap one to open it. */
export const Village: FunctionComponent<VillageProps> = (props) => {
  const { land, error, retry } = useLand();

  if (!land) {
    return (
      <div className="relative rounded-2xl overflow-hidden border border-frame/80 bg-[#1C3F54] shadow-card h-[clamp(380px,64svh,680px)] flex flex-col items-center justify-center gap-2 text-sm">
        {error ? (
          <>
            <span className="text-bad">{error}</span>
            <Button size="small" variant="outline" onClick={retry}>
              Try again
            </Button>
          </>
        ) : (
          <span className="text-muted font-display">Unrolling your land…</span>
        )}
      </div>
    );
  }

  return <VillageLand land={land} {...props} />;
};
