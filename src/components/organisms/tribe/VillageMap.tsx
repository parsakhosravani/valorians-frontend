"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import { useGame } from "@/context";
import { BUILDINGS, BuildingDef, RESOURCE_IDS, buildingImage } from "@/lib/game/config";
import { buildingUpgradeInfo, getRates } from "@/lib/game/engine";
import { formatDuration } from "@/lib/format";

/** Size of the village in map pixels (before zoom). */
const W = 780;
const H = 1160;

/**
 * Where each building stands: x/y is the middle of its base, s its size.
 * North is the military quarter, the Town Hall sits on the plaza, the
 * economy lives around it, fields to the south and the gate on the wall.
 */
const PLOTS: Record<string, { x: number; y: number; s?: number }> = {
  "exploration-center": { x: 110, y: 175 },
  watchtower: { x: 390, y: 165, s: 120 },
  "iron-mine": { x: 670, y: 180 },
  "siege-workshop": { x: 120, y: 330 },
  "military-command": { x: 290, y: 320 },
  "war-hall": { x: 490, y: 320 },
  sawmill: { x: 665, y: 335 },
  barracks: { x: 115, y: 480 },
  stable: { x: 255, y: 470 },
  armory: { x: 525, y: 470 },
  arsenal: { x: 670, y: 485 },
  "town-hall": { x: 390, y: 590, s: 170 },
  trapmaker: { x: 105, y: 645 },
  treasury: { x: 245, y: 655 },
  academy: { x: 540, y: 655 },
  brickyard: { x: 680, y: 650 },
  hideout: { x: 110, y: 810 },
  "resource-warehouse": { x: 255, y: 815 },
  "trading-post": { x: 395, y: 805 },
  embassy: { x: 540, y: 815 },
  hospital: { x: 685, y: 810 },
  windmill: { x: 210, y: 975, s: 125 },
  "fertilizer-workshop": { x: 430, y: 970 },
  "city-gate": { x: 390, y: 1125, s: 150 },
};

const DEFAULT_SIZE = 116;
const ZOOMS = [0.55, 0.7, 0.85, 1];

/** Trees as [x, y, radius]. */
const TREES: [number, number, number][] = [
  [745, 250, 26], [770, 300, 22], [735, 395, 24], [768, 430, 20], [752, 350, 18],
  [30, 250, 22], [18, 330, 26], [40, 410, 20], [24, 560, 24], [44, 720, 20], [20, 900, 26],
  [60, 1060, 24], [740, 1060, 26], [700, 1110, 20], [600, 1080, 18], [160, 1110, 22],
  [250, 60, 18], [520, 70, 20], [200, 110, 16],
];

const Ground = () => (
  <svg aria-hidden="true" className="absolute inset-0" height={H} viewBox={`0 0 ${W} ${H}`} width={W}>
    <rect fill="#28331D" height={H} width={W} />
    {/* Meadow patches */}
    <ellipse cx="200" cy="300" fill="#2E3B21" rx="190" ry="140" />
    <ellipse cx="560" cy="760" fill="#2E3B21" rx="230" ry="160" />
    <ellipse cx="300" cy="980" fill="#313F23" rx="260" ry="120" />
    {/* Mountains behind the mine */}
    <polygon fill="#3B3A35" points="560,120 640,10 700,90 760,0 780,0 780,140" />
    <polygon fill="#4A4842" points="620,120 690,40 740,110" />
    {/* River */}
    <path
      d="M 790 360 C 720 450, 770 560, 735 650 S 640 780, 750 905 S 820 1040, 790 1160"
      fill="none"
      stroke="#25404F"
      strokeLinecap="round"
      strokeWidth="46"
    />
    <path
      d="M 790 360 C 720 450, 770 560, 735 650 S 640 780, 750 905 S 820 1040, 790 1160"
      fill="none"
      stroke="#31586B"
      strokeLinecap="round"
      strokeWidth="26"
    />
    {/* Fields */}
    {[0, 1, 2, 3, 4].map((i) => (
      <rect
        key={i}
        fill={i % 2 ? "#4B4E24" : "#57582A"}
        height="26"
        transform="rotate(-6 320 1010)"
        width="420"
        x="110"
        y={950 + i * 26}
        opacity="0.75"
      />
    ))}
    {/* Roads */}
    <g fill="none" stroke="#4E3C29" strokeLinecap="round" strokeLinejoin="round" strokeWidth="22">
      <path d="M 390 610 L 390 1125" />
      <path d="M 390 590 L 390 165" />
      <path d="M 110 330 L 665 330" />
      <path d="M 110 655 C 250 630, 530 630, 680 655" />
      <path d="M 110 815 L 685 815" />
      <path d="M 390 180 L 670 180" />
    </g>
    <g fill="none" stroke="#5E4A33" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10">
      <path d="M 390 610 L 390 1125" />
      <path d="M 390 590 L 390 165" />
      <path d="M 110 330 L 665 330" />
      <path d="M 110 655 C 250 630, 530 630, 680 655" />
      <path d="M 110 815 L 685 815" />
      <path d="M 390 180 L 670 180" />
    </g>
    {/* Plaza */}
    <ellipse cx="390" cy="600" fill="#5A4630" rx="135" ry="62" />
    <ellipse cx="390" cy="600" fill="#665036" rx="110" ry="46" />
    {/* Palisade with the gate at the bottom */}
    <ellipse
      cx="390"
      cy="630"
      fill="none"
      rx="350"
      ry="495"
      stroke="#6B4A2B"
      strokeDasharray="10 7"
      strokeWidth="7"
    />
    {/* Forest */}
    {TREES.map(([x, y, r], i) => (
      <g key={i}>
        <circle cx={x} cy={y} fill="#1D2814" r={r} />
        <circle cx={x - r * 0.25} cy={y - r * 0.3} fill="#26341A" r={r * 0.6} />
      </g>
    ))}
  </svg>
);

const UpArrow = () => (
  <svg aria-hidden="true" fill="none" height="16" stroke="#1A120B" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 24 24" width="16">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

const Hammer = () => (
  <svg aria-hidden="true" fill="none" height="16" stroke="#1A120B" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24" width="16">
    <path d="m15 12-8.5 8.5a2.1 2.1 0 1 1-3-3L12 9" />
    <path d="M17.6 6.4 20 4M14 4l6 6-4 4-6-6z" />
  </svg>
);

const Plot = ({ b, onOpen }: { b: BuildingDef; onOpen: (b: BuildingDef) => void }) => {
  const { state, now } = useGame();
  const pos = PLOTS[b.id] ?? { x: W / 2, y: H / 2 };
  const s = pos.s ?? DEFAULT_SIZE;
  const level = state.buildings[b.id] ?? 0;
  const job = state.queue.find((q) => q.building === b.id);
  const info = buildingUpgradeInfo(state, b.id);
  // Only built buildings get the arrow; empty plots already say "Build".
  const canUpgrade =
    level > 0 &&
    !job &&
    !info.maxed &&
    state.queue.length < getRates(state).builders &&
    RESOURCE_IDS.every((r) => state.resources[r] >= info.cost);
  const progress = job ? Math.min(1, (now - job.startedAt) / (job.endsAt - job.startedAt)) : 0;

  return (
    <>
      {/* Dirt pad the building stands on */}
      <div
        className="absolute rounded-[50%] bg-[#4A3A28]/90"
        style={{ left: pos.x - s * 0.42, top: pos.y - s * 0.17, width: s * 0.84, height: s * 0.3 }}
      />
      <button
        aria-label={`${b.name}, level ${level}${job ? ", upgrading" : canUpgrade ? ", can upgrade" : ""}`}
        className="absolute group"
        style={{ left: pos.x - s / 2, top: pos.y - s * 0.92, width: s, height: s, zIndex: Math.round(pos.y) }}
        onClick={() => onOpen(b)}
      >
        <Image
          draggable={false}
          alt=""
          className={clsx(
            "w-full h-full object-contain transition-transform group-active:scale-95 drop-shadow-[0_8px_8px_rgba(0,0,0,0.45)]",
            level === 0 && !job && "grayscale opacity-45"
          )}
          height={s}
          src={buildingImage(b)}
          width={s}
        />
        {level > 0 && (
          <span className="absolute left-1 top-2 min-w-6 h-6 px-1 rounded-full bg-gold text-[#1A120B] font-display font-black text-xs flex items-center justify-center shadow">
            {level}
          </span>
        )}
        {job ? (
          <span className="absolute right-1 top-2 w-7 h-7 rounded-full bg-ember flex items-center justify-center shadow animate-bounce">
            <Hammer />
          </span>
        ) : (
          canUpgrade && (
            <span className="absolute right-1 top-2 w-7 h-7 rounded-full bg-good flex items-center justify-center shadow animate-spot">
              <UpArrow />
            </span>
          )
        )}
      </button>
      {/* Name plate */}
      <div
        className="absolute flex flex-col items-center pointer-events-none"
        style={{ left: pos.x - 70, top: pos.y + 2, width: 140, zIndex: Math.round(pos.y) + 1 }}
      >
        <span
          className={clsx(
            "px-2 py-0.5 rounded-full text-[11px] font-extrabold whitespace-nowrap border",
            level === 0 && !job ? "bg-panel/90 text-muted border-line" : "bg-panel/95 text-parch border-line"
          )}
        >
          {level === 0 && !job ? `Build ${b.name}` : b.name}
        </span>
        {job && (
          <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-[#FFB27A]">
            <span className="w-14 h-1.5 rounded-full bg-panel2 overflow-hidden">
              <span className="block h-full bg-gradient-to-r from-gold to-ember" style={{ width: `${progress * 100}%` }} />
            </span>
            {formatDuration(job.endsAt - now)}
          </span>
        )}
      </div>
    </>
  );
};

export const VillageMap = ({ onOpen }: { onOpen: (b: BuildingDef) => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);

  // Pick a zoom that fits the phone, then centre on the Town Hall.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Big enough to read on a phone; pan to see the rest.
    const fit = el.clientWidth >= 340 ? 0.7 : ZOOMS[0];

    setZoom(fit);
    requestAnimationFrame(() => {
      const th = PLOTS["town-hall"];

      el.scrollLeft = th.x * fit - el.clientWidth / 2;
      el.scrollTop = th.y * fit - el.clientHeight / 2;
    });
  }, []);

  const changeZoom = (dir: 1 | -1) => {
    const el = ref.current;
    const i = ZOOMS.indexOf(zoom);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + dir))];
    if (!el || next === zoom) return;
    // Keep the middle of the view in place.
    const cx = (el.scrollLeft + el.clientWidth / 2) / zoom;
    const cy = (el.scrollTop + el.clientHeight / 2) / zoom;

    setZoom(next);
    requestAnimationFrame(() => {
      el.scrollLeft = cx * next - el.clientWidth / 2;
      el.scrollTop = cy * next - el.clientHeight / 2;
    });
  };

  // Drag to pan with a mouse; touch uses native scrolling.
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
    <div className="relative flex-1 min-h-0">
      <div
        ref={ref}
        className="absolute inset-0 overflow-auto scrollable overscroll-contain cursor-grab active:cursor-grabbing select-none [touch-action:pan-x_pan-y]"
        onClickCapture={onClickCapture}
        onPointerDown={onPointerDown}
        onPointerLeave={() => (drag.current = null)}
        onPointerMove={onPointerMove}
        onPointerUp={() => setTimeout(() => (drag.current = null), 0)}
      >
        <div style={{ width: W * zoom, height: H * zoom }}>
          <div className="relative origin-top-left" style={{ width: W, height: H, transform: `scale(${zoom})` }}>
            <Ground />
            {[...BUILDINGS]
              .sort((a, b) => (PLOTS[a.id]?.y ?? 0) - (PLOTS[b.id]?.y ?? 0))
              .map((b) => (
                <Plot key={b.id} b={b} onOpen={onOpen} />
              ))}
          </div>
        </div>
      </div>

      <div className="absolute right-2 bottom-2 flex flex-col gap-1.5 z-10">
        <button
          aria-label="Zoom in"
          className="w-11 h-11 rounded-xl bg-panel/95 border border-line text-xl font-black text-goldtext"
          onClick={() => changeZoom(1)}
        >
          +
        </button>
        <button
          aria-label="Zoom out"
          className="w-11 h-11 rounded-xl bg-panel/95 border border-line text-xl font-black text-goldtext"
          onClick={() => changeZoom(-1)}
        >
          −
        </button>
      </div>
    </div>
  );
};
