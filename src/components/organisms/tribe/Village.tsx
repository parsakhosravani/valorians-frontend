"use client";

import clsx from "clsx";
import { CSSProperties, FunctionComponent, memo, useEffect, useId, useMemo, useRef, useState } from "react";

import { Slot, placeBuildings, villageLayout, waterSide } from "./villageLayout";

import { CHUNK, DETAIL_CHUNK, GroundOverview, GroundPiece, TILE, baseRes, closeUpRes } from "@/components/organisms/war/MapGround";
import { MapCanvas, MapPainter } from "@/components/organisms/war/MapCanvas";
import type { MapData } from "@/components/organisms/war/WarMap";
import { Button } from "@/components/atoms/Button";
import { useGameStatus } from "@/context";
import { apiRequest } from "@/lib/api";
import { BuildingDef, buildingImage } from "@/lib/game/config";
import { Point, terrainAt } from "@/lib/game/map";
import { UpgradeOption, canStart } from "@/lib/game/advice";
import { formatDuration } from "@/lib/format";

/**
 * Your village on your own land: the war map's ground round your tribe (its
 * hills, woods and shore, or the open sea round an island tribe) with the
 * village's own ground in the middle, and every building on it with its name,
 * level and what it's doing, all in one view. Tap a building to open it.
 *
 * The land is painted as on the war map (land pieces from the ground worker,
 * drawn on MapCanvas); where buildings stand comes from villageLayout.
 */

const T = TILE;
/** Tiles of land either side of your tile that may be in view. */
const R = 6;
const SIDE = (2 * R + 1) * T;
/** Tiles of land across the frame's longer side. */
const LAND_ACROSS = 6.6;

// ─── Your land ───────────────────────────────────────────────────────────────

type Land = { home: Point };

/** Kept for the session: your tile doesn't move. */
let landCache: Land | null = null;

/** Your tile, from the war map's own request (it also settles a brand-new tribe). */
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
        landCache = { home: d.home };
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

/** Tracks an element's width. */
const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;

    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));

    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
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

type PlotProps = {
  o: UpgradeOption;
  at: Slot;
  /** Room the building has (px). */
  cellW: number;
  cellH: number;
  freeBuilder: boolean;
  now: number;
  onOpen: (b: BuildingDef) => void;
};

/** A building in its room: its picture, a gem or the work under way over the roof, and its level and name below. */
const Building = memo(function Building({ o, at, cellW, cellH, freeBuilder, now, onOpen }: PlotProps) {
  const hall = o.building.id === "town-hall";
  const art = Math.min(cellW * 0.72, cellH - 34, 80) * (hall ? 1.2 : 1);
  const top = at.y - cellH / 2 + 2 - (hall ? art * 0.12 : 0);
  const built = o.level > 0;
  const ready = !o.job && freeBuilder && canStart(o);
  // The gem is for upgrading what stands; an empty plot you can build on shows a green "+".
  const gem = ready && built;
  const progress = o.job ? Math.min(1, (now - o.job.startedAt) / (o.job.endsAt - o.job.startedAt)) : 0;
  const label = `${o.building.name}, level ${o.level}${ready ? ", ready to upgrade" : ""}${o.job ? ", upgrading" : ""}`;

  return (
    <button
      aria-label={label}
      className="group absolute flex flex-col items-center outline-none"
      style={{ left: at.x - cellW / 2, top, width: cellW, zIndex: Math.round(at.y) }}
      title={o.building.name}
      type="button"
      onClick={() => onOpen(o.building)}
    >
      <span className="relative block" style={{ width: art, height: art }}>
        {/* The plot: trampled earth under a building, a staked-out patch on an empty one */}
        <span
          className={clsx(
            "absolute left-[6%] right-[6%] bottom-[6%] h-[30%] rounded-[50%]",
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
        {gem && <UpgradeMark className="absolute -right-1 top-0 w-[20px] h-[20px]" />}
        {o.job && (
          <span className="absolute left-1/2 -top-1 -translate-x-1/2 flex flex-col items-center gap-0.5">
            <span className="px-1.5 rounded bg-[#1A120B]/90 border border-gold/40 text-[10px] leading-[14px] font-bold text-goldtext whitespace-nowrap">
              {formatDuration(o.job.endsAt - now)}
            </span>
            <span className="w-10 h-1.5 rounded-full bg-[#1A120B]/90 border border-black/40 overflow-hidden">
              <span className="block h-full bg-gradient-to-r from-gold to-ember" style={{ width: `${progress * 100}%` }} />
            </span>
          </span>
        )}
      </span>
      {/* Level and name */}
      <span
        className={clsx(
          "-mt-1.5 flex items-center gap-1 max-w-[calc(100%-4px)] py-0.5 pl-0.5 pr-1.5 rounded-full border",
          "bg-[#1A120B]/85 shadow-[0_1px_4px_rgba(0,0,0,0.7)] transition-colors group-hover:border-gold",
          ready ? "border-good/80" : o.job ? "border-gold/70" : built ? "border-frame" : "border-line/60 border-dashed",
        )}
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
        <span className={clsx("text-[10.5px] font-bold leading-[1.1] text-left line-clamp-2", built || o.job ? "text-parch" : "text-muted")}>
          {o.building.name}
        </span>
      </span>
    </button>
  );
});

// ─── The village ─────────────────────────────────────────────────────────────

/**
 * The village's own ground: a rounded, slightly uneven square (a squircle),
 * so the buildings in the corners stand on it too. The same tribe always gets the same one.
 */
const groundShape = (w: number, h: number, seed: number) => {
  const pts: string[] = [];
  const round = (c: number) => Math.sign(c) * Math.abs(c) ** 0.4;

  for (let a = 0; a < 96; a++) {
    const th = (a / 96) * Math.PI * 2;
    const k = 1 - 0.022 * (1 + Math.sin(3 * th + seed)) - 0.014 * (1 + Math.sin(5 * th + seed * 2.3));

    pts.push(`${(w / 2 + round(Math.cos(th)) * (w / 2 - 4) * k).toFixed(1)},${(h / 2 + round(Math.sin(th)) * (h / 2 - 4) * k).toFixed(1)}`);
  }

  return `M${pts.join(" L")}Z`;
};

const VillageLand = ({ land, options, freeBuilder, now, onOpen, width }: { land: Land; width: number } & VillageProps) => {
  const { home } = land;
  const ids = options.map((o) => o.building.id).sort().join(",");
  const layout = useMemo(() => villageLayout(width, ids.split(",").length, Math.min(640, width * 0.6)), [width, ids]);
  const water = useMemo(() => waterSide(home, terrainAt), [home]);
  const plots = useMemo(() => placeBuildings(layout, ids.split(","), water), [layout, ids, water]);
  const { height } = layout;

  // The land behind: your tile in the middle of the frame, LAND_ACROSS tiles across its longer side.
  const ox = home.x - R;
  const oy = home.y - R;
  const mid = R * T + T / 2;
  const z = Math.max(width, height) / (LAND_ACROSS * T);
  const cam = useMemo(() => ({ x: width / 2 - mid * z, y: height / 2 - mid * z, z }), [width, height, mid, z]);
  const camRef = useRef(cam);
  const painter = useRef<MapPainter | null>(null);

  camRef.current = cam;
  useEffect(() => painter.current?.setCamera(cam), [cam]);

  const ground = useMemo(() => {
    const out: { key: string; x: number; y: number; n: number; detail: boolean; res: number; prio: number }[] = [];
    // Tiles in view.
    const x0 = ox + Math.floor(-cam.x / z / T);
    const y0 = oy + Math.floor(-cam.y / z / T);
    const x1 = ox + Math.ceil((width - cam.x) / z / T);
    const y1 = oy + Math.ceil((height - cam.y) / z / T);
    const add = (size: number, detail: boolean, res: number) => {
      for (let y = Math.floor(y0 / size) * size; y < y1; y += size)
        for (let x = Math.floor(x0 / size) * size; x < x1; x += size) {
          out.push({ key: `${detail ? "d" : "b"}${x},${y}`, x, y, n: size, detail, res, prio: Math.hypot(x + size / 2 - home.x, y + size / 2 - home.y) + (detail ? 12 : 0) });
        }
    };

    add(CHUNK, false, baseRes());
    const close = closeUpRes(z);

    if (close) add(DETAIL_CHUNK, true, close);

    return out;
  }, [cam, z, ox, oy, width, height, home]);

  // Tracks between the buildings: each joined to the nearest one already reached, out from the Town Hall.
  const tracks = useMemo(() => {
    const ids = Object.keys(plots);
    const reached = ["town-hall"].filter((id) => plots[id]);
    const left = ids.filter((id) => id !== "town-hall");
    const out: string[] = [];

    while (reached.length && left.length) {
      let pick = 0;
      let from = reached[0];
      let shortest = Infinity;

      left.forEach((id, k) => {
        for (const r of reached) {
          const d = Math.hypot(plots[id].x - plots[r].x, plots[id].y - plots[r].y);

          if (d < shortest) {
            shortest = d;
            pick = k;
            from = r;
          }
        }
      });
      const [id] = left.splice(pick, 1);
      const p = plots[from];
      const q = plots[id];
      const bend = ((from.length * 7 + id.length * 3) % 5) / 5 - 0.4;

      out.push(
        `M${p.x.toFixed(1)} ${(p.y + 4).toFixed(1)} Q${((p.x + q.x) / 2 - (q.y - p.y) * bend * 0.2).toFixed(1)} ${((p.y + q.y) / 2 + 4 + (q.x - p.x) * bend * 0.2).toFixed(1)} ${q.x.toFixed(1)} ${(q.y + 4).toFixed(1)}`,
      );
      reached.push(id);
    }

    return out;
  }, [plots]);

  const gid = useId().replace(/:/g, "");
  const shape = groundShape(width, height, (home.x * 7 + home.y * 13) % 10);
  const hall = plots["town-hall"];

  return (
    <div className="relative rounded-2xl overflow-hidden border border-frame/80 bg-[#1C3F54] shadow-card" style={{ height }}>
      {/* The land round your tribe, as the war map paints it */}
      <MapCanvas
        onPainter={(p) => {
          painter.current = p;
          p?.setCamera(camRef.current);
        }}
      />
      <div aria-hidden="true" className="hidden">
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
            home=""
            n={p.n}
            occupied=""
            prio={p.prio}
            res={p.res}
            x={p.x}
            y={p.y}
            onImage={(img) =>
              painter.current?.setPiece(p.key, img && { img, left: (p.x - ox) * T, top: (p.y - oy) * T, size: p.n * T, detail: p.detail })
            }
          />
        ))}
      </div>

      {/* The village's own ground, its border, and the tracks worn across it */}
      <svg aria-hidden="true" className="absolute inset-0 pointer-events-none" height={height} viewBox={`0 0 ${width} ${height}`} width={width}>
        <defs>
          <radialGradient id={`${gid}-ground`}>
            <stop offset="0" stopColor="#66753A" stopOpacity="0.97" />
            <stop offset="0.7" stopColor="#5E6A34" stopOpacity="0.95" />
            <stop offset="0.9" stopColor="#74663F" stopOpacity="0.85" />
            <stop offset="1" stopColor="#8C7A4E" stopOpacity="0.55" />
          </radialGradient>
        </defs>
        <path d={shape} fill={`url(#${gid}-ground)`} />
        <path d={shape} fill="none" stroke="rgba(255,214,130,0.75)" strokeDasharray="7 5" strokeWidth="2" />
        <g fill="none" strokeLinecap="round">
          {tracks.map((d, i) => (
            <path key={`b${i}`} d={d} stroke="#4E3A22" strokeOpacity="0.45" strokeWidth="7" />
          ))}
          {tracks.map((d, i) => (
            <path key={`t${i}`} d={d} stroke="#A88A5C" strokeOpacity="0.7" strokeWidth="4" />
          ))}
        </g>
        {hall && (
          <ellipse cx={hall.x} cy={hall.y + 2} fill="#9A7C52" opacity="0.65" rx={layout.cellW * 0.48} ry={layout.cellH * 0.3} stroke="#6E5534" strokeOpacity="0.6" />
        )}
      </svg>

      {options.map((o) =>
        plots[o.building.id] ? (
          <Building
            key={o.building.id}
            at={plots[o.building.id]}
            cellH={layout.cellH}
            cellW={layout.cellW}
            freeBuilder={freeBuilder}
            now={now}
            o={o}
            onOpen={onOpen}
          />
        ) : null,
      )}

      {/* A soft vignette ties the edges into the frame */}
      <span className="pointer-events-none absolute inset-0 z-[100000] rounded-2xl shadow-[inset_0_0_40px_rgba(0,0,0,0.45)]" />
    </div>
  );
};

type VillageProps = {
  options: UpgradeOption[];
  freeBuilder: boolean;
  now: number;
  onOpen: (b: BuildingDef) => void;
};

/** The tribe as a village on its own land: every building with its name and level. Tap one to open it. */
export const Village: FunctionComponent<VillageProps> = (props) => {
  const { land, error, retry } = useLand();
  const [ref, width] = useWidth();

  return (
    <div ref={ref} className="w-full">
      {land && width ? (
        <VillageLand land={land} width={width} {...props} />
      ) : (
        <div className="relative rounded-2xl overflow-hidden border border-frame/80 bg-[#1C3F54] shadow-card h-[420px] flex flex-col items-center justify-center gap-2 text-sm">
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
      )}
    </div>
  );
};
