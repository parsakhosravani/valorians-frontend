"use client";
import clsx from "clsx";

import { ClanFlag } from "@/components/molecules/ClanFlag";
import { ClanFlag as Flag, FLAG_COLORS, FLAG_EMBLEMS, FLAG_PATTERNS, defaultFlag, emblemImage } from "@/lib/game/clan";
import { GameIcon } from "@/components/atoms/GameIcon";

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[11px] font-extrabold tracking-[0.08em] text-muted uppercase">{children}</span>
);

const Swatches = ({ value, onChange, label }: { value: number; onChange: (i: number) => void; label: string }) => (
  <div className="flex flex-col gap-1.5">
    <Label>{label}</Label>
    <div className="grid grid-cols-10 gap-1.5">
      {FLAG_COLORS.map((c, i) => (
        <button
          key={c}
          aria-label={`${label} colour ${i + 1}`}
          aria-pressed={value === i}
          className={clsx(
            "aspect-square rounded-md border-2 transition-transform",
            value === i ? "border-goldtext scale-110" : "border-[#1A120B]"
          )}
          style={{ background: c }}
          type="button"
          onClick={() => onChange(i)}
        />
      ))}
    </div>
  </div>
);

/** Pick a clan banner: field and pattern colours, pattern, emblem. */
export const FlagDesigner = ({ value, onChange, seed = 1 }: { value: Flag; onChange: (f: Flag) => void; seed?: number }) => {
  const set = (patch: Partial<Flag>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-24 h-28 rounded-xl bg-panel border border-line">
          <ClanFlag flag={value} size={92} />
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <p className="text-xs text-sub">Your banner flies over every member's village on the map and beside your clan's name.</p>
          <button
            className="self-start h-8 px-3 rounded-[10px] bg-panel2 border border-line text-sm font-bold text-parch"
            type="button"
            onClick={() => onChange(defaultFlag(seed + Math.floor(Math.random() * 1e6)))}
          >
            <GameIcon e="🎲" /> Surprise me
          </button>
        </div>
      </div>

      <Swatches label="Field" value={value.bg} onChange={(bg) => set({ bg })} />
      <Swatches label="Pattern colour" value={value.fg} onChange={(fg) => set({ fg })} />

      <div className="flex flex-col gap-1.5">
        <Label>Pattern</Label>
        <div className="grid grid-cols-5 gap-1.5">
          {FLAG_PATTERNS.map((p) => (
            <button
              key={p.id}
              aria-pressed={value.pattern === p.id}
              className={clsx(
                "flex flex-col items-center gap-0.5 rounded-lg border py-1",
                value.pattern === p.id ? "border-gold bg-gold/10" : "border-line bg-panel"
              )}
              type="button"
              onClick={() => set({ pattern: p.id })}
            >
              <ClanFlag flag={{ ...value, pattern: p.id, emblem: -1 }} size={30} title={p.name} />
              <span className="text-[9px] font-bold text-sub leading-tight">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Emblem</Label>
        <div className="grid grid-cols-9 gap-1">
          <button
            aria-pressed={value.emblem === -1}
            className={clsx(
              "aspect-square rounded-lg border text-[10px] font-bold text-muted",
              value.emblem === -1 ? "border-gold bg-gold/10" : "border-line bg-panel"
            )}
            type="button"
            onClick={() => set({ emblem: -1 })}
          >
            None
          </button>
          {FLAG_EMBLEMS.map((e, i) => (
            <button
              key={e}
              aria-pressed={value.emblem === i}
              className={clsx(
                "aspect-square rounded-lg border p-1 flex items-center justify-center",
                value.emblem === i ? "border-gold bg-gold/10" : "border-line bg-panel"
              )}
              type="button"
              onClick={() => set({ emblem: i })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={e} className="w-full h-full object-contain" draggable={false} src={emblemImage(i) ?? ""} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
