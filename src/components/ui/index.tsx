"use client";
/**
 * Valorians UI kit. Every screen is built from these pieces; colours,
 * type and elevation come from src/design/tokens.ts through Tailwind.
 */
import React, { useEffect } from "react";
import Link from "next/link";
import clsx from "clsx";

import { Icon, IconName } from "./Icon";

import { AvatarArt, GameIcon, GameIconId, Scene, SceneKind } from "@/art";
import { compact } from "@/lib/format";

export { Icon } from "./Icon";
export type { IconName } from "./Icon";

// ─── Button ──────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "relative inline-flex items-center justify-center gap-2 select-none whitespace-nowrap transition-[transform,filter] duration-100 active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950 shadow-button font-display font-bold tracking-wide",
  secondary: "bg-ink-700 text-parch border border-ink-400 font-bold",
  ghost: "bg-transparent text-gold-300 border border-gold-500/60 font-bold",
  danger: "bg-gradient-to-b from-ember-400 to-ember-500 text-parch-50 shadow-button font-display font-bold tracking-wide",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 rounded-xl text-[14px]",
  md: "h-11 px-5 rounded-xl text-[16px]",
  lg: "h-[52px] px-6 rounded-2xl text-[19px]",
};

export type ButtonProps = {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  href?: string;
  type?: "button" | "submit";
};

export const Button = ({
  children,
  variant = "primary",
  size = "md",
  full,
  icon,
  disabled,
  loading,
  className,
  onClick,
  href,
  type = "button",
}: ButtonProps) => {
  const cls = clsx(
    BUTTON_BASE,
    BUTTON_VARIANT[variant],
    BUTTON_SIZE[size],
    full && "w-full",
    (disabled || loading) && "!bg-none !bg-ink-700 !text-parch-700 !border !border-ink-500 !shadow-none active:!translate-y-0 cursor-not-allowed",
    className
  );
  const body = (
    <>
      {loading ? (
        <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        icon && <Icon name={icon} size={size === "sm" ? 16 : 20} />
      )}
      {children}
    </>
  );

  if (href && !disabled) {
    return (
      <Link className={cls} href={href as any} onClick={onClick}>
        {body}
      </Link>
    );
  }

  return (
    <button className={cls} disabled={disabled || loading} type={type} onClick={onClick}>
      {body}
    </button>
  );
};

/** Square icon-only button. */
export const IconButton = ({
  name,
  label,
  onClick,
  className,
  tone = "neutral",
}: {
  name: IconName;
  label: string;
  onClick?: () => void;
  className?: string;
  tone?: "neutral" | "gold";
}) => (
  <button
    aria-label={label}
    className={clsx(
      "w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0 active:translate-y-px transition-transform",
      tone === "gold" ? "bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950 shadow-button" : "bg-ink-700 border border-ink-500 text-parch-300",
      className
    )}
    type="button"
    onClick={onClick}
  >
    <Icon name={name} size={20} />
  </button>
);

// ─── Surfaces ────────────────────────────────────────────────────────────────

type CardTone = "default" | "raised" | "gold" | "danger" | "sunken";

const CARD_TONE: Record<CardTone, string> = {
  default: "bg-ink-800 border border-ink-500/70 shadow-card",
  raised: "bg-ink-700 border border-ink-400/70 shadow-raised",
  gold: "bg-gradient-to-br from-[#3A2B16] to-ink-800 border border-gold-500 shadow-glow",
  danger: "bg-gradient-to-br from-ember-900 to-ink-800 border border-ember-700 shadow-danger",
  sunken: "bg-ink-950/60 border border-ink-600",
};

export const Card = ({
  children,
  tone = "default",
  className,
  onClick,
  href,
  pad = true,
}: {
  children: React.ReactNode;
  tone?: CardTone;
  className?: string;
  onClick?: () => void;
  href?: string;
  pad?: boolean;
}) => {
  const cls = clsx("rounded-2xl text-left", CARD_TONE[tone], pad && "p-3", (onClick || href) && "active:scale-[0.985] transition-transform", className);

  if (href) {
    return (
      <Link className={clsx("block", cls)} href={href as any}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button className={clsx("block w-full", cls)} type="button" onClick={onClick}>
        {children}
      </button>
    );
  }

  return <div className={cls}>{children}</div>;
};

/** Screen or section heading with an optional action on the right. */
export const SectionTitle = ({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) => (
  <div className={clsx("flex items-end justify-between gap-3", className)}>
    <h2 className="font-display font-bold text-display-md text-parch">{children}</h2>
    {action}
  </div>
);

/** Small uppercase label used above numbers. */
export const Overline = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={clsx("text-caption font-extrabold uppercase tracking-[0.14em] text-parch-500", className)}>{children}</span>
);

// ─── Badges and numbers ──────────────────────────────────────────────────────

type BadgeTone = "gold" | "ember" | "moss" | "sky" | "neutral";

const BADGE_TONE: Record<BadgeTone, string> = {
  gold: "bg-gold-400 text-ink-950",
  ember: "bg-ember-500 text-parch-50",
  moss: "bg-moss-600 text-parch-50",
  sky: "bg-sky-600 text-parch-50",
  neutral: "bg-ink-600 text-parch-300",
};

export const Badge = ({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: BadgeTone; className?: string }) => (
  <span className={clsx("inline-flex items-center gap-1 h-6 px-2 rounded-full text-caption font-extrabold", BADGE_TONE[tone], className)}>{children}</span>
);

/** Building level in a little gold shield. */
export const LevelShield = ({ level, className }: { level: number; className?: string }) => (
  <span className={clsx("relative inline-flex w-7 h-8 items-center justify-center font-display font-extrabold text-[14px] text-ink-950", className)}>
    <svg aria-hidden="true" className="absolute inset-0 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]" viewBox="0 0 28 32">
      <path d="M14 1 26 5v10c0 8-5 13-12 16C7 28 2 23 2 15V5z" fill="#F0BE5A" stroke="#6E4F1A" strokeWidth="2" />
      <path d="M14 4 23 7v8c0 6-4 10-9 12.5z" fill="#FCE3A6" opacity="0.5" />
    </svg>
    <span className="relative">{level}</span>
  </span>
);

/** Icon + number, e.g. a cost, a reward, a stock count. */
export const Amount = ({
  icon,
  value,
  suffix,
  tone,
  size = "sm",
  raw,
  className,
}: {
  icon: GameIconId;
  value: number | string;
  suffix?: string;
  tone?: "bad" | "good" | "muted";
  size?: "xs" | "sm" | "md" | "lg";
  /** Show the full number instead of 1.2K. */
  raw?: boolean;
  className?: string;
}) => {
  const px = { xs: 14, sm: 18, md: 22, lg: 28 }[size];
  const text = typeof value === "number" ? (raw ? Math.floor(value).toLocaleString("en-US") : compact(value)) : value;

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 font-extrabold whitespace-nowrap",
        { xs: "text-caption", sm: "text-small", md: "text-body", lg: "text-display-md font-display" }[size],
        tone === "bad" && "text-blood-400",
        tone === "good" && "text-moss-400",
        tone === "muted" && "text-parch-500",
        className
      )}
    >
      <GameIcon id={icon} size={px} />
      {text}
      {suffix}
    </span>
  );
};

/** Label + big number, for stat strips. */
export const Stat = ({ label, icon, value, tone }: { label: string; icon?: GameIconId; value: React.ReactNode; tone?: "bad" | "good" }) => (
  <div className="flex flex-col items-center gap-0.5 min-w-0">
    <Overline>{label}</Overline>
    <span className={clsx("inline-flex items-center gap-1 font-display font-bold text-[19px] leading-none", tone === "bad" && "text-blood-400", tone === "good" && "text-moss-400")}>
      {icon && <GameIcon id={icon} size={20} />}
      {value}
    </span>
  </div>
);

// ─── Progress ────────────────────────────────────────────────────────────────

const METER_TONE = {
  gold: "bg-gradient-to-r from-gold-500 to-gold-300",
  ember: "bg-gradient-to-r from-gold-400 to-ember-500",
  moss: "bg-gradient-to-r from-moss-600 to-moss-400",
  sky: "bg-gradient-to-r from-sky-600 to-sky-400",
};

export const Meter = ({
  value,
  max,
  tone = "gold",
  size = "sm",
  className,
  label,
}: {
  value: number;
  max: number;
  tone?: keyof typeof METER_TONE;
  size?: "xs" | "sm" | "md";
  className?: string;
  label?: string;
}) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

  return (
    <div
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={Math.round(value)}
      className={clsx("w-full rounded-full bg-ink-950/70 border border-ink-600 overflow-hidden", { xs: "h-1.5", sm: "h-2.5", md: "h-3.5" }[size], className)}
      role="progressbar"
    >
      <div className={clsx("h-full rounded-full transition-[width] duration-300", METER_TONE[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
};

// ─── Choice ──────────────────────────────────────────────────────────────────

/** Segmented control for switching views (tabs). */
export const Segmented = <T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { id: T; label: string; badge?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) => (
  <div className={clsx("flex w-full p-1 gap-1 rounded-2xl bg-ink-950/60 border border-ink-600", className)} role="tablist">
    {options.map((o) => {
      const on = o.id === value;

      return (
        <button
          key={o.id}
          aria-selected={on}
          className={clsx(
            "relative flex-1 h-9 rounded-xl text-small transition-colors",
            on ? "bg-ink-600 text-gold-300 font-extrabold shadow-[inset_0_1px_0_rgba(255,236,200,0.08)] border border-ink-400" : "text-parch-500 font-bold"
          )}
          role="tab"
          type="button"
          onClick={() => onChange(o.id)}
        >
          {o.label}
          {!!o.badge && (
            <span className="absolute -top-1.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-ember-500 text-parch-50 text-[10px] font-extrabold flex items-center justify-center border-2 border-ink-900">
              {o.badge}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

/** − [n] + Max */
export const Stepper = ({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) => {
  const set = (n: number) => onChange(Math.max(0, Math.min(max, Math.floor(n || 0))));
  const btn = "w-9 h-9 rounded-xl bg-ink-700 border border-ink-500 text-parch font-extrabold inline-flex items-center justify-center active:translate-y-px";

  return (
    <div className="flex items-center gap-1">
      <button aria-label="Fewer" className={btn} type="button" onClick={() => set(value - 1)}>
        <Icon name="minus" size={16} />
      </button>
      <input
        aria-label="Amount"
        className="w-14 h-9 rounded-xl bg-ink-950/70 border border-ink-600 text-center text-body font-extrabold outline-none focus:border-gold-500"
        inputMode="numeric"
        value={value}
        onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")))}
      />
      <button aria-label="More" className={btn} type="button" onClick={() => set(value + 1)}>
        <Icon name="plus" size={16} />
      </button>
      <button className={clsx(btn, "w-auto px-2.5 text-caption tracking-wider")} type="button" onClick={() => set(max)}>
        MAX
      </button>
    </div>
  );
};

// ─── People ──────────────────────────────────────────────────────────────────

export const Avatar = ({ src, seed = 0, size = 40, className, ring }: { src?: string | null; seed?: number; size?: number; className?: string; ring?: boolean }) => (
  <span
    className={clsx("inline-block overflow-hidden rounded-xl shrink-0 bg-ink-700", ring ? "border-2 border-gold-400" : "border border-ink-500", className)}
    style={{ width: size, height: size }}
  >
    {src ? (
      // Telegram avatars are remote; a plain img avoids next/image domain config.
      // eslint-disable-next-line @next/next/no-img-element
      <img alt="" className="w-full h-full object-cover" src={src} />
    ) : (
      <AvatarArt className="w-full h-full" seed={seed} />
    )}
  </span>
);

// ─── Sheet ───────────────────────────────────────────────────────────────────

/** Bottom sheet. Tap the backdrop, the close button or Escape to dismiss. */
export const Sheet = ({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        className={clsx("fixed inset-0 z-40 bg-ink-950/70 transition-opacity duration-200", open ? "opacity-100" : "opacity-0 pointer-events-none")}
        onClick={onClose}
      />
      <div
        aria-modal="true"
        className={clsx(
          "fixed inset-x-0 bottom-0 z-50 max-w-md mx-auto transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          open ? "translate-y-0" : "translate-y-full"
        )}
        role="dialog"
      >
        <div className="relative rounded-t-3xl bg-ink-800 border-t border-x border-ink-400 shadow-[0_-12px_40px_rgba(0,0,0,0.5)]">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-400 to-transparent" />
          <div className="flex justify-center pt-2">
            <span className="w-10 h-1 rounded-full bg-ink-400" />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 pt-1">
            <h2 className="font-display font-bold text-display-md min-h-[28px]">{title}</h2>
            <IconButton label="Close" name="close" onClick={onClose} />
          </div>
          <div className="px-4 pt-2 pb-[max(env(safe-area-inset-bottom),20px)] max-h-[80svh] overflow-y-auto scrollable">{children}</div>
        </div>
      </div>
    </>
  );
};

// ─── Misc ────────────────────────────────────────────────────────────────────

export const Empty = ({ title, children, art }: { title: string; children?: React.ReactNode; art?: React.ReactNode }) => (
  <div className="flex flex-col items-center text-center gap-1.5 py-6 px-4">
    {art}
    <p className="font-display font-bold text-title">{title}</p>
    {children && <p className="text-small text-parch-500 max-w-[280px]">{children}</p>}
  </div>
);

export const Spinner = ({ label = "Loading" }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-6 text-parch-500 text-small font-bold" role="status">
    <span className="w-4 h-4 rounded-full border-2 border-gold-400 border-t-transparent animate-spin" />
    {label}…
  </div>
);

/** Rounded tile behind building and troop art. */
export const ArtTile = ({ children, size = 88, className, tone = "default" }: { children: React.ReactNode; size?: number; className?: string; tone?: "default" | "locked" }) => (
  <div
    className={clsx(
      "relative shrink-0 rounded-2xl overflow-hidden border",
      tone === "locked" ? "bg-ink-900 border-ink-600" : "bg-[radial-gradient(ellipse_at_50%_35%,#3B4A2E_0%,#25301F_60%,#1B2218_100%)] border-ink-500",
      className
    )}
    style={{ width: size, height: size }}
  >
    {children}
  </div>
);

/** Full-screen illustrated background, dimmed so content stays readable. */
export const Backdrop = ({ scene, dim = 0.72 }: { scene: SceneKind; dim?: number }) => (
  <div aria-hidden="true" className="fixed inset-0 -z-10 max-w-md mx-auto overflow-hidden pointer-events-none">
    <Scene className="absolute inset-0 w-full h-full" kind={scene} />
    <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(21,17,13,${dim}) 0%, rgba(21,17,13,${Math.min(1, dim + 0.15)}) 60%, rgba(21,17,13,0.97) 100%)` }} />
  </div>
);
