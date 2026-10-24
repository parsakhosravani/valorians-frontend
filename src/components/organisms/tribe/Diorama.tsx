"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import { useGame } from "@/context";
import { BUILDINGS, BuildingDef, RESOURCE_IDS, buildingImage } from "@/lib/game/config";
import { buildingUpgradeInfo, getRates } from "@/lib/game/engine";
import { formatDuration } from "@/lib/format";

// ─── Layout ──────────────────────────────────────────────────────────────────
//
// A 6×6 isometric island. (col, row): col runs to the lower right, row to the
// lower left; (0,0) is the back corner, (5,5) the front where the gate is.

const N = 6;
const TW = 112; // tile width on screen
const TH = 56; // tile height on screen
const CLIFF = 74;
const PAD_X = 50;
const TOP = 150; // room above the back row for tall buildings
const BOARD_W = N * TW + PAD_X * 2;
const BOARD_H = TOP + N * TH + CLIFF + 60;
const OX = BOARD_W / 2; // screen x of the back corner
const OY = TOP;

type Decor = "pines" | "rocks" | "field" | "fire" | "hay";

type Cell = { col: number; row: number; building?: string; decor?: Decor; span?: 2 };

const CELLS: Cell[] = [
  { col: 0, row: 0, building: "exploration-center" },
  { col: 1, row: 0, building: "watchtower" },
  { col: 2, row: 0, decor: "pines" },
  { col: 3, row: 0, building: "military-command" },
  { col: 4, row: 0, building: "war-hall" },
  { col: 5, row: 0, building: "iron-mine" },
  { col: 0, row: 1, building: "siege-workshop" },
  { col: 1, row: 1, building: "barracks" },
  { col: 2, row: 1, building: "stable" },
  { col: 3, row: 1, building: "armory" },
  { col: 4, row: 1, building: "arsenal" },
  { col: 5, row: 1, building: "sawmill" },
  { col: 0, row: 2, building: "trapmaker" },
  { col: 1, row: 2, building: "treasury" },
  { col: 2, row: 2, building: "town-hall", span: 2 },
  { col: 4, row: 2, building: "academy" },
  { col: 5, row: 2, building: "brickyard" },
  { col: 0, row: 3, building: "hideout" },
  { col: 1, row: 3, building: "embassy" },
  { col: 4, row: 3, building: "hospital" },
  { col: 5, row: 3, decor: "pines" },
  { col: 0, row: 4, building: "windmill" },
  { col: 1, row: 4, building: "fertilizer-workshop" },
  { col: 2, row: 4, building: "resource-warehouse" },
  { col: 3, row: 4, building: "trading-post" },
  { col: 4, row: 4, decor: "fire" },
  { col: 5, row: 4, decor: "rocks" },
  { col: 0, row: 5, decor: "field" },
  { col: 1, row: 5, decor: "hay" },
  { col: 2, row: 5, decor: "pines" },
  { col: 3, row: 5, decor: "rocks" },
  { col: 4, row: 5, decor: "pines" },
  { col: 5, row: 5, building: "city-gate" },
];

/** Screen position of a tile's top corner. */
const tileTop = (col: number, row: number) => ({ x: OX + (col - row) * (TW / 2), y: OY + (col + row) * (TH / 2) });

/** Screen centre of a cell (or of a 2×2 block). */
const cellCenter = (c: Cell) => {
  const k = c.span ?? 1;
  const t = tileTop(c.col, c.row);

  return { x: t.x, y: t.y + (k * TH) / 2 };
};

const diamond = (cx: number, cy: number, w: number, h: number) =>
  `${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}`;

/** Deterministic noise so tiles keep their colours. */
const noise = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;

  return s - Math.floor(s);
};

// ─── The island ──────────────────────────────────────────────────────────────

const Island = ({ selected }: { selected?: Cell }) => {
  const T = tileTop(0, 0);
  const R = tileTop(N, 0);
  const B = tileTop(N, N);
  const L = tileTop(0, N);
  const pt = (p: { x: number; y: number }, dy = 0) => `${p.x},${p.y + dy}`;
  const occupied = new Set<string>();

  CELLS.forEach((c) => {
    const k = c.span ?? 1;

    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) occupied.add(`${c.col + i},${c.row + j}`);
  });

  return (
    <svg aria-hidden="true" className="absolute inset-0" height={BOARD_H} viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} width={BOARD_W}>
      <defs>
        <linearGradient id="dio-left" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#7A5634" />
          <stop offset="1" stopColor="#3E2A1A" />
        </linearGradient>
        <linearGradient id="dio-right" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#5E4128" />
          <stop offset="1" stopColor="#2C1E13" />
        </linearGradient>
        <radialGradient id="dio-light" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#FFF3C8" stopOpacity="0.28" />
          <stop offset="1" stopColor="#FFF3C8" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Shadow on the sea and a ring of foam */}
      <ellipse cx={B.x} cy={B.y + CLIFF + 14} fill="#0B1A1F" opacity="0.55" rx={N * TW * 0.46} ry="30" />
      <polygon
        fill="none"
        opacity="0.35"
        points={`${pt(T, CLIFF + 26)} ${R.x + 26},${R.y + CLIFF} ${pt(B, CLIFF + 26)} ${L.x - 26},${L.y + CLIFF}`}
        stroke="#CFE7EA"
        strokeDasharray="2 10"
        strokeLinecap="round"
        strokeWidth="3"
      />

      {/* Cliffs with layered earth and stone */}
      <polygon fill="url(#dio-left)" points={`${pt(L)} ${pt(B)} ${pt(B, CLIFF)} ${pt(L, CLIFF)}`} />
      <polygon fill="url(#dio-right)" points={`${pt(B)} ${pt(R)} ${pt(R, CLIFF)} ${pt(B, CLIFF)}`} />
      {[0.32, 0.58, 0.8].map((f, i) => (
        <g key={i} opacity={0.35 - i * 0.07} stroke="#1E140C" strokeWidth="2">
          <line x1={L.x} x2={B.x} y1={L.y + CLIFF * f} y2={B.y + CLIFF * f} />
          <line x1={B.x} x2={R.x} y1={B.y + CLIFF * f} y2={R.y + CLIFF * f} />
        </g>
      ))}
      {Array.from({ length: 16 }, (_, i) => {
        const left = i < 8;
        const f = ((i % 8) + 0.5) / 8;
        const a = left ? L : B;
        const b = left ? B : R;
        const x = a.x + (b.x - a.x) * f;
        const y = a.y + (b.y - a.y) * f + CLIFF * (0.4 + noise(i, 3) * 0.4);

        return <ellipse key={i} cx={x} cy={y} fill={left ? "#8C8172" : "#6E655A"} rx={7 + noise(i, 1) * 6} ry={4 + noise(i, 2) * 3} />;
      })}
      {/* Grass lip hanging over the edge */}
      <polyline
        fill="none"
        points={`${pt(L, 3)} ${pt(B, 3)} ${pt(R, 3)}`}
        stroke="#4F7A2C"
        strokeLinejoin="round"
        strokeWidth="9"
      />

      {/* Grass tiles */}
      {Array.from({ length: N * N }, (_, k) => {
        const col = k % N;
        const row = Math.floor(k / N);
        const t = tileTop(col, row);
        const n = noise(col, row);
        const fill = n > 0.66 ? "#7FA647" : n > 0.33 ? "#77A042" : "#729A3E";

        return (
          <polygon
            key={k}
            fill={fill}
            points={diamond(t.x, t.y + TH / 2, TW, TH)}
            stroke="#5F8635"
            strokeOpacity="0.35"
            strokeWidth="1"
          />
        );
      })}

      {/* Stone paths between the plots */}
      {Array.from({ length: N + 1 }, (_, i) => {
        const a = tileTop(i, 0);
        const b = tileTop(i, N);
        const c = tileTop(0, i);
        const d = tileTop(N, i);

        return (
          <g key={i} opacity="0.55" stroke="#C9B48A" strokeDasharray="10 6" strokeWidth="3">
            <line x1={a.x} x2={b.x} y1={a.y} y2={b.y} />
            <line x1={c.x} x2={d.x} y1={c.y} y2={d.y} />
          </g>
        );
      })}

      {/* Plots under buildings */}
      {CELLS.filter((c) => c.building).map((c) => {
        const k = c.span ?? 1;
        const ctr = cellCenter(c);
        const isSel = selected === c;

        return (
          <g key={c.building}>
            <polygon fill="#B79E73" points={diamond(ctr.x, ctr.y, TW * k * 0.86, TH * k * 0.86)} />
            <polygon fill="#9C8460" points={diamond(ctr.x, ctr.y + 2, TW * k * 0.7, TH * k * 0.7)} />
            {isSel && (
              <polygon
                className="animate-pulse"
                fill="none"
                points={diamond(ctr.x, ctr.y, TW * k * 0.96, TH * k * 0.96)}
                stroke="#F2C66D"
                strokeWidth="4"
              />
            )}
          </g>
        );
      })}

      {/* Warm light over the island */}
      <polygon fill="url(#dio-light)" points={`${pt(T)} ${pt(R)} ${pt(B)} ${pt(L)}`} />
    </svg>
  );
};

// ─── Decorations ─────────────────────────────────────────────────────────────

const Pine = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx="3" cy="2" fill="#2D3F1A" opacity="0.5" rx="14" ry="6" />
    <rect fill="#5A3A22" height="12" width="5" x="-2.5" y="-10" />
    {[0, 1, 2].map((i) => (
      <g key={i} transform={`translate(0 ${-14 - i * 13}) scale(${1 - i * 0.22})`}>
        <polygon fill="#2F5A2A" points="0,-24 -16,4 16,4" />
        <polygon fill="#24481F" points="0,-24 16,4 0,4" />
      </g>
    ))}
  </g>
);

const DecorArt = ({ kind }: { kind: Decor }) => {
  const w = TW;
  const h = 110;

  return (
    <svg aria-hidden="true" height={h} overflow="visible" viewBox={`${-w / 2} ${-h + TH / 2} ${w} ${h}`} width={w}>
      {kind === "pines" && (
        <>
          <Pine s={1.05} x={-18} y={-4} />
          <Pine s={0.8} x={20} y={-10} />
          <Pine s={0.9} x={6} y={10} />
        </>
      )}
      {kind === "rocks" && (
        <g>
          <ellipse cx="2" cy="10" fill="#3E5A24" opacity="0.5" rx="34" ry="10" />
          <polygon fill="#8E8A80" points="-26,8 -18,-14 -2,-18 6,4" />
          <polygon fill="#6E6A62" points="-2,-18 6,4 -6,10" />
          <polygon fill="#9E9A90" points="4,10 12,-6 26,-2 30,12" />
          <polygon fill="#7A766D" points="26,-2 30,12 20,14" />
        </g>
      )}
      {kind === "field" && (
        <g>
          <clipPath id="dio-field">
            <polygon points={diamond(0, 0, TW * 0.86, TH * 0.86)} />
          </clipPath>
          <g clipPath="url(#dio-field)">
            {Array.from({ length: 9 }, (_, i) => (
              <line key={i} stroke={i % 2 ? "#C9A649" : "#A88A39"} strokeWidth="7" x1={-60 + i * 14} x2={-20 + i * 14} y1={-40} y2={40} />
            ))}
          </g>
        </g>
      )}
      {kind === "hay" && (
        <g>
          <ellipse cx="0" cy="8" fill="#3E5A24" opacity="0.5" rx="30" ry="9" />
          <path d="M -24 6 Q -24 -22 -6 -26 Q 10 -22 10 6 Z" fill="#D9B45A" />
          <path d="M -6 -26 Q 10 -22 10 6 L 0 6 Q 2 -16 -6 -26 Z" fill="#B8923F" />
          <path d="M 6 8 Q 6 -12 18 -14 Q 30 -12 30 8 Z" fill="#CFA94F" />
        </g>
      )}
      {kind === "fire" && (
        <g>
          <ellipse cx="0" cy="4" fill="#FF8A3D" opacity="0.25" rx="40" ry="16" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;

            return <ellipse key={i} cx={Math.cos(a) * 16} cy={Math.sin(a) * 7} fill="#7E776C" rx="5" ry="3.5" />;
          })}
          <g className="origin-bottom animate-flame" style={{ transformBox: "fill-box" }}>
            <path d="M 0 2 C -12 -6 -8 -20 0 -32 C 8 -20 12 -6 0 2 Z" fill="#E8612C" />
            <path d="M 0 2 C -6 -4 -4 -14 0 -22 C 4 -14 6 -4 0 2 Z" fill="#FFC56B" />
          </g>
        </g>
      )}
    </svg>
  );
};

// ─── Buildings ───────────────────────────────────────────────────────────────

type Status = { level: number; job?: { toLevel: number; startedAt: number; endsAt: number }; canUpgrade: boolean };

const Bubble = ({ tone, children }: { tone: "good" | "work"; children: React.ReactNode }) => (
  <span
    className={clsx(
      "flex items-center justify-center gap-1 h-7 min-w-7 px-1.5 rounded-full text-[11px] font-black shadow-[0_2px_6px_rgba(0,0,0,0.5)] border-2",
      tone === "good" ? "bg-good text-[#1A120B] border-[#E6F5D9]" : "bg-ember text-[#FFF4EA] border-[#FFD2B0]"
    )}
  >
    {children}
  </span>
);

const BuildingOnPlot = ({
  b,
  cell,
  st,
  now,
  interactive,
  onOpen,
}: {
  b: BuildingDef;
  cell: Cell;
  st: Status;
  now: number;
  interactive: boolean;
  onOpen?: () => void;
}) => {
  const k = cell.span ?? 1;
  const ctr = cellCenter(cell);
  const size = k === 2 ? TW * 1.9 : TW * 1.08;
  const unbuilt = st.level === 0 && !st.job;
  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      aria-label={interactive ? `${b.name}, level ${st.level}` : undefined}
      className={clsx("absolute", interactive && "group")}
      style={{
        left: ctr.x - size / 2,
        top: ctr.y - size * 0.86,
        width: size,
        height: size,
        zIndex: (cell.col + cell.row + k) * 10 + 5,
      }}
      onClick={interactive ? onOpen : undefined}
    >
      {unbuilt ? (
        <>
          {/* Construction site: stakes, rope and a faint sketch of what goes here */}
          <svg aria-hidden="true" className="absolute inset-0" overflow="visible" viewBox={`0 0 ${size} ${size}`}>
            {[
              [0.5, 0.66],
              [0.84, 0.82],
              [0.5, 0.98],
              [0.16, 0.82],
            ].map(([x, y], i) => (
              <g key={i}>
                <rect fill="#6B4A2B" height="16" rx="1.5" width="4" x={size * x - 2} y={size * y - 14} />
              </g>
            ))}
            <polygon
              fill="none"
              points={`${size * 0.5},${size * 0.66 - 9} ${size * 0.84},${size * 0.82 - 9} ${size * 0.5},${size * 0.98 - 9} ${size * 0.16},${size * 0.82 - 9}`}
              stroke="#D9C49A"
              strokeWidth="1.5"
            />
          </svg>
          <Image
            draggable={false}
            alt=""
            className="absolute left-1/2 -translate-x-1/2 bottom-[16%] w-[62%] h-[62%] object-contain opacity-40 sepia grayscale"
            height={size}
            src={buildingImage(b)}
            width={size}
          />
        </>
      ) : (
        <Image
          draggable={false}
          alt=""
          className={clsx(
            "w-full h-full object-contain drop-shadow-[0_10px_8px_rgba(20,30,10,0.45)] transition-transform",
            interactive && "group-active:scale-95"
          )}
          height={size}
          sizes={`${Math.round(size)}px`}
          src={buildingImage(b)}
          width={size}
        />
      )}

      {/* Level shield */}
      {st.level > 0 && (
        <span className="absolute left-[14%] bottom-[8%] w-7 h-8 flex items-center justify-center font-display font-black text-[13px] text-[#1A120B] drop-shadow-[0_2px_2px_rgba(0,0,0,0.6)]">
          <svg aria-hidden="true" className="absolute inset-0" viewBox="0 0 28 32">
            <path d="M14 1 26 5v10c0 8-5 13-12 16C7 28 2 23 2 15V5z" fill="#E3A948" stroke="#7A5420" strokeWidth="2" />
          </svg>
          <span className="relative">{st.level}</span>
        </span>
      )}

      {/* Status bubble above the roof */}
      {interactive && (st.job || st.canUpgrade) && (
        <span className="absolute left-1/2 -translate-x-1/2 top-[2%] animate-float">
          {st.job ? (
            <Bubble tone="work">
              <svg aria-hidden="true" fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" viewBox="0 0 24 24" width="13">
                <path d="m15 12-8.5 8.5a2.1 2.1 0 1 1-3-3L12 9M17.6 6.4 20 4M14 4l6 6-4 4-6-6z" />
              </svg>
              {formatDuration(st.job.endsAt - now)}
            </Bubble>
          ) : (
            <Bubble tone="good">
              <svg aria-hidden="true" fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 24 24" width="13">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </Bubble>
          )}
        </span>
      )}
    </Tag>
  );
};

// ─── Board (shared by Build and the Hall banner) ─────────────────────────────

const useStatuses = () => {
  const { state } = useGame();

  return useMemo(() => {
    const free = state.queue.length < getRates(state).builders;
    const out: Record<string, Status> = {};

    for (const b of BUILDINGS) {
      const level = state.buildings[b.id] ?? 0;
      const job = state.queue.find((q) => q.building === b.id);
      const info = buildingUpgradeInfo(state, b.id);

      out[b.id] = {
        level,
        job,
        canUpgrade:
          level > 0 && !job && !info.maxed && free && RESOURCE_IDS.every((r) => state.resources[r] >= info.cost),
      };
    }

    return out;
  }, [state]);
};

const Board = ({
  interactive,
  selectedId,
  onOpen,
}: {
  interactive: boolean;
  selectedId?: string;
  onOpen?: (b: BuildingDef) => void;
}) => {
  const { now } = useGame();
  const statuses = useStatuses();
  const selected = CELLS.find((c) => c.building === selectedId);

  return (
    <div className="relative" style={{ width: BOARD_W, height: BOARD_H }}>
      <Island selected={selected} />
      {CELLS.map((c) => {
        const ctr = cellCenter(c);

        if (c.decor) {
          return (
            <div
              key={`${c.col},${c.row}`}
              className="absolute pointer-events-none"
              style={{ left: ctr.x - TW / 2, top: ctr.y - 110 + TH / 2, zIndex: (c.col + c.row + 1) * 10 }}
            >
              <DecorArt kind={c.decor} />
            </div>
          );
        }
        const b = BUILDINGS.find((x) => x.id === c.building);

        if (!b) return null;

        return (
          <BuildingOnPlot
            key={b.id}
            b={b}
            cell={c}
            interactive={interactive}
            now={now}
            st={statuses[b.id]}
            onOpen={() => onOpen?.(b)}
          />
        );
      })}
    </div>
  );
};

const SeaBackground = () => (
  <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,#2D5966_0%,#1B3A44_45%,#11252C_100%)]">
    <svg className="absolute inset-0 w-full h-full opacity-[0.12]">
      <defs>
        <pattern height="40" id="dio-waves" patternUnits="userSpaceOnUse" width="80">
          <path d="M0 20 Q 10 14 20 20 T 40 20 T 60 20 T 80 20" fill="none" stroke="#E6F4F5" strokeWidth="1.5" />
        </pattern>
      </defs>
      <rect fill="url(#dio-waves)" height="100%" width="100%" />
    </svg>
  </div>
);

// ─── Public components ───────────────────────────────────────────────────────

/** A non-interactive picture of the player's island (for the Hall banner). */
export const IslandPreview = ({ height }: { height: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.45);

  useEffect(() => {
    const el = ref.current;

    if (!el) return;
    const fit = () => setScale(Math.min((el.clientWidth + 40) / BOARD_W, (height + 50) / BOARD_H));

    fit();
    const ro = new ResizeObserver(fit);

    ro.observe(el);

    return () => ro.disconnect();
  }, [height]);

  return (
    <div ref={ref} className="relative w-full overflow-hidden" style={{ height }}>
      <SeaBackground />
      <div
        className="absolute left-1/2 top-0 origin-top"
        style={{ width: BOARD_W, height: BOARD_H, transform: `translateX(-50%) scale(${scale})`, marginTop: -40 * scale }}
      >
        <Board interactive={false} />
      </div>
    </div>
  );
};

const ZOOMS = [0.45, 0.6, 0.8, 1, 1.2];
/** Sea margin around the island inside the scroll area. */
const MX = 60;
const MY = 40;

/** The Build screen's village: pan, pinch or +/− to zoom, tap a building. */
export const Diorama = ({ onOpen, selectedId }: { onOpen: (b: BuildingDef) => void; selectedId?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.8);
  const zoomRef = useRef(zoom);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);

  zoomRef.current = zoom;

  const zoomTo = (next: number, focus?: { x: number; y: number }) => {
    const el = ref.current;
    const z = Math.max(ZOOMS[0], Math.min(ZOOMS[ZOOMS.length - 1], next));

    if (!el || z === zoomRef.current) return;
    const fx = focus?.x ?? el.clientWidth / 2;
    const fy = focus?.y ?? el.clientHeight / 2;
    const bx = (el.scrollLeft + fx - MX) / zoomRef.current;
    const by = (el.scrollTop + fy - MY) / zoomRef.current;

    zoomRef.current = z;
    setZoom(z);
    requestAnimationFrame(() => {
      el.scrollLeft = bx * z + MX - fx;
      el.scrollTop = by * z + MY - fy;
    });
  };

  // Start centred on the Town Hall, sized to the phone.
  useEffect(() => {
    const el = ref.current;

    if (!el) return;
    const z = 0.8;
    const th = cellCenter(CELLS.find((c) => c.building === "town-hall")!);

    zoomRef.current = z;
    setZoom(z);
    requestAnimationFrame(() => {
      el.scrollLeft = th.x * z + MX - el.clientWidth / 2;
      el.scrollTop = (th.y - 30) * z + MY - el.clientHeight / 2;
    });
  }, []);

  // Two-finger pinch zoom.
  useEffect(() => {
    const el = ref.current;

    if (!el) return;
    let start: { d: number; z: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) start = { d: dist(e.touches), z: zoomRef.current };
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const focus = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      };

      zoomTo(start.z * (dist(e.touches) / start.d), focus);
    };
    const onEnd = () => (start = null);

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []);

  // Mouse: drag to pan, wheel to zoom.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !ref.current) return;
    drag.current = { x: e.clientX, y: e.clientY, left: ref.current.scrollLeft, top: ref.current.scrollTop, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;

    if (!d || !ref.current) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;

    if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
    ref.current.scrollLeft = d.left - dx;
    ref.current.scrollTop = d.top - dy;
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current?.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
    drag.current = null;
  };

  return (
    <div className="absolute inset-0">
      <SeaBackground />
      <div
        ref={ref}
        className="absolute inset-0 overflow-auto scrollable overscroll-contain select-none cursor-grab active:cursor-grabbing"
        onClickCapture={onClickCapture}
        onPointerDown={onPointerDown}
        onPointerLeave={() => (drag.current = null)}
        onPointerMove={onPointerMove}
        onPointerUp={() => setTimeout(() => (drag.current = null), 0)}
        onWheel={(e) => {
          if (!e.ctrlKey && Math.abs(e.deltaY) < 40) return;
          const rect = ref.current!.getBoundingClientRect();

          zoomTo(zoomRef.current * (e.deltaY > 0 ? 0.9 : 1.1), { x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
      >
        <div style={{ width: BOARD_W * zoom + MX * 2, height: BOARD_H * zoom + MY * 2, padding: `${MY}px ${MX}px` }}>
          <div className="origin-top-left" style={{ width: BOARD_W, height: BOARD_H, transform: `scale(${zoom})` }}>
            <Board interactive selectedId={selectedId} onOpen={onOpen} />
          </div>
        </div>
      </div>

      <div className="absolute right-2 bottom-2 flex flex-col gap-1.5 z-10">
        <button
          aria-label="Zoom in"
          className="w-11 h-11 rounded-xl bg-panel/95 border border-line text-xl font-black text-goldtext shadow-lg"
          onClick={() => zoomTo(ZOOMS.find((z) => z > zoom + 0.01) ?? zoom)}
        >
          +
        </button>
        <button
          aria-label="Zoom out"
          className="w-11 h-11 rounded-xl bg-panel/95 border border-line text-xl font-black text-goldtext shadow-lg"
          onClick={() => zoomTo([...ZOOMS].reverse().find((z) => z < zoom - 0.01) ?? zoom)}
        >
          −
        </button>
      </div>
    </div>
  );
};
