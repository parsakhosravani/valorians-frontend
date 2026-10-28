"use client";
import { FormEvent, useEffect, useState } from "react";

import { ROUGH } from "./MapGround";

import { Drawer } from "@/components/molecules/Drawer";
import { MAP_CENTER, MAP_MAX, MAP_MIN, MAP_SIZE } from "@/lib/game/config";
import { terrainAt } from "@/lib/game/map";

/**
 * The whole world on one card: tap anywhere to go there, or type a spot.
 *
 * Players read coordinates Travian-style, with 0|0 in the middle of the world
 * (MAP_CENTER), so they run from -200 to 199 on each axis.
 */

type Pt = { x: number; y: number };

export const shownCoord = (v: number) => v - MAP_CENTER;
const fromShown = (v: number) => v + MAP_CENTER;

/** Parses "12|-40", "12, -40" or "12 -40" into world tiles. */
export const parseCoords = (s: string): Pt | null => {
  const m = s.trim().match(/^(-?\d{1,4})\s*[|,;/\s]\s*(-?\d{1,4})$/);

  if (!m) return null;
  const p = { x: fromShown(Number(m[1])), y: fromShown(Number(m[2])) };

  return p.x >= MAP_MIN && p.x < MAP_MAX && p.y >= MAP_MIN && p.y < MAP_MAX ? p : null;
};

// One pixel per tile, worked out once a session: 160,000 tiles takes a moment.
let picture: string | null = null;

const paintWorld = () => {
  const c = document.createElement("canvas");

  c.width = c.height = MAP_SIZE;
  const g = c.getContext("2d");

  if (!g) return "";
  const img = g.createImageData(MAP_SIZE, MAP_SIZE);

  for (let j = 0; j < MAP_SIZE; j++)
    for (let i = 0; i < MAP_SIZE; i++) {
      const [r, gr, b] = ROUGH[terrainAt(MAP_MIN + i, MAP_MIN + j)];
      const p = (j * MAP_SIZE + i) * 4;

      img.data[p] = r;
      img.data[p + 1] = gr;
      img.data[p + 2] = b;
      img.data[p + 3] = 255;
    }
  g.putImageData(img, 0, 0);

  return c.toDataURL("image/png");
};

/** Where a world tile sits on the card, in %. */
const pct = (v: number) => ((v - MAP_MIN) / MAP_SIZE) * 100;

export function WorldMap({
  open,
  home,
  view,
  onClose,
  onGo,
}: {
  open: boolean;
  home: Pt;
  /** The tiles on screen right now. */
  view: { x0: number; y0: number; x1: number; y1: number } | null;
  onClose: () => void;
  onGo: (p: Pt) => void;
}) {
  const [src, setSrc] = useState<string | null>(picture);
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);

  useEffect(() => {
    if (!open || src) return;
    // Let the sheet slide up first.
    const t = setTimeout(() => setSrc((picture ??= paintWorld())), 60);

    return () => clearTimeout(t);
  }, [open, src]);

  const go = (p: Pt) => {
    onGo(p);
    onClose();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = parseCoords(text);

    setBad(!p);
    if (p) go(p);
  };

  const mid = view ? { x: Math.round((view.x0 + view.x1) / 2), y: Math.round((view.y0 + view.y1) / 2) } : null;

  return (
    <Drawer isOpen={open} position="bottom" title="The world" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <button
          aria-label="Tap a spot to go there"
          className="relative w-full aspect-square rounded-xl overflow-hidden border border-frame bg-[#1C3F54] shadow-[inset_0_0_24px_rgba(0,0,0,0.5)]"
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();

            go({
              x: MAP_MIN + Math.floor(((e.clientX - r.left) / r.width) * MAP_SIZE),
              y: MAP_MIN + Math.floor(((e.clientY - r.top) / r.height) * MAP_SIZE),
            });
          }}
        >
          {src ? (
            <img alt="" className="absolute inset-0 w-full h-full" draggable={false} src={src} />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-sm text-muted font-display">
              Charting the world…
            </span>
          )}
          {view && (
            <span
              aria-hidden="true"
              className="absolute border-2 border-goldtext rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
              style={{
                left: `${pct(view.x0)}%`,
                top: `${pct(view.y0)}%`,
                width: `max(8px, ${pct(view.x1) - pct(view.x0)}%)`,
                height: `max(8px, ${pct(view.y1) - pct(view.y0)}%)`,
              }}
            />
          )}
          <span
            aria-hidden="true"
            className="absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full bg-gold ring-2 ring-ink shadow-[0_0_8px_rgba(227,169,72,0.9)]"
            style={{ left: `${pct(home.x + 0.5)}%`, top: `${pct(home.y + 0.5)}%` }}
          />
        </button>

        <p className="text-xs text-sub leading-snug">
          Tap anywhere to go there. Your tribe is at{" "}
          <b className="text-goldtext tabular-nums">
            {shownCoord(home.x)}|{shownCoord(home.y)}
          </b>
          {mid && (
            <>
              , and you&apos;re looking at{" "}
              <b className="text-parch tabular-nums">
                {shownCoord(mid.x)}|{shownCoord(mid.y)}
              </b>
            </>
          )}
          .
        </p>

        <form className="flex gap-2" onSubmit={submit}>
          <input
            aria-invalid={bad}
            aria-label="Go to x|y"
            autoComplete="off"
            className="inset flex-1 min-w-0 h-10 px-3 text-sm font-bold text-parch tabular-nums placeholder:text-muted/70 outline-none focus:border-gold aria-[invalid=true]:border-bad"
            placeholder="Go to x|y, e.g. 12|-40"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setBad(false);
            }}
          />
          <button className="btn btn-gold px-5 h-10 font-display font-black text-sm" type="submit">
            Go
          </button>
        </form>
        {bad && <p className="-mt-1.5 text-xs text-bad">Type two numbers from -200 to 199, like 12|-40.</p>}
      </div>
    </Drawer>
  );
}
