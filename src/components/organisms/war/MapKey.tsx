"use client";
import React, { useState } from "react";
import clsx from "clsx";
import { RINGS, Ring } from "./MapCanvas";

const OPEN_KEY = "map-key-open";

/** A ground ring as the map draws it: same colours, same glow. */
const Swatch: React.FC<{ ring: Ring; small?: boolean }> = ({ ring, small }) => {
  const r = RINGS[ring];

  return (
    <span
      aria-hidden
      className={clsx("shrink-0 rounded-[50%] border-2", small ? "w-3 h-2" : "w-5 h-2.5")}
      style={{
        borderColor: r.stroke,
        background: r.fill,
        boxShadow: r.glow ? `0 0 ${small ? 4 : 7}px ${r.glow[1]}` : undefined,
      }}
    />
  );
};

interface Entry {
  ring: Ring;
  label: string;
  hint: string;
}

const STRENGTH: Entry[] = [
  { ring: "weaker", label: "Weaker", hint: "under ¾ of your power" },
  { ring: "even", label: "Even", hint: "about your power" },
  { ring: "stronger", label: "Stronger", hint: "over ⅓ more power" },
];

interface MapKeyProps {
  /** Which clan colours can show up for you right now. */
  clan: boolean;
  treaty: boolean;
  war: boolean;
  hidden?: boolean;
  /** The "how war works" button. */
  help: React.ReactNode;
}

/**
 * What the coloured rings under villages mean. Folds into a small pill so it
 * doesn't cover the map; remembers whether you left it open.
 */
export const MapKey: React.FC<MapKeyProps> = ({ clan, treaty, war, hidden, help }) => {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggle = (to: boolean) => {
    setOpen(to);
    try {
      localStorage.setItem(OPEN_KEY, to ? "1" : "0");
    } catch {
      /* private mode */
    }
  };

  const relations: Entry[] = [
    { ring: "me", label: "You", hint: "your village and outposts" },
    ...(clan ? [{ ring: "ally" as Ring, label: "Clan", hint: "your clanmates" }] : []),
    ...(treaty ? [{ ring: "friend" as Ring, label: "Treaty", hint: "alliance or pact: no raids" }] : []),
    ...(war ? [{ ring: "enemy" as Ring, label: "War", hint: "clans you're at war with" }] : []),
  ];
  const dots: Ring[] = ["weaker", "even", "stronger", ...relations.slice(1).map((e) => e.ring)];

  const row = (e: Entry) => (
    <li key={e.ring} className="flex items-center gap-2 min-h-[22px]">
      <Swatch ring={e.ring} />
      <span className="font-bold text-parch text-[12px] w-[52px] shrink-0">{e.label}</span>
      <span className="text-[11px] text-muted leading-tight">{e.hint}</span>
    </li>
  );

  return (
    <div className={clsx("absolute left-2 bottom-2 z-10", hidden && "hidden")}>
      {open ? (
        <div className="w-[228px] rounded-xl border border-frame/80 bg-ink/90 backdrop-blur-[2px] shadow-card p-2.5 pt-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-display text-[12px] font-black tracking-[0.06em] uppercase text-goldtext">Map key</span>
            <span className="flex items-center gap-1.5">
              {help}
              <button
                aria-label="Close the map key"
                className="w-6 h-6 grid place-items-center rounded-md text-sub active:scale-95 transition-transform"
                type="button"
                onClick={() => toggle(false)}
              >
                ✕
              </button>
            </span>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted mb-1">Power next to yours</p>
          <ul className="flex flex-col gap-0.5">{STRENGTH.map(row)}</ul>
          <div className="my-2 h-px bg-frame/60" />
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted mb-1">Who they are</p>
          <ul className="flex flex-col gap-0.5">{relations.map(row)}</ul>
        </div>
      ) : (
        <button
          aria-expanded={false}
          aria-label="Open the map key"
          className="flex items-center gap-2 h-8 rounded-full border border-frame/80 bg-ink/85 backdrop-blur-[2px] shadow-card pl-2.5 pr-3 active:scale-95 transition-transform"
          type="button"
          onClick={() => toggle(true)}
        >
          <span className="flex items-center -space-x-0.5">
            {dots.map((r) => (
              <Swatch key={r} small ring={r} />
            ))}
          </span>
          <span className="font-display text-[11px] font-black tracking-[0.06em] uppercase text-goldtext">Key</span>
        </button>
      )}
    </div>
  );
};
