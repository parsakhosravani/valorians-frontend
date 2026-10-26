import clsx from "clsx";
import React from "react";

import { GameIcon } from "./GameIcon";

/*
 * Valorians v2 building blocks. They are thin wrappers over the classes in
 * globals.css (.card, .seg, .bar, .title-*) so screens stay consistent.
 */

/** Page title with an optional line under it and something on the right (a button, a pill). */
export const ScreenHeader = ({
  title,
  subtitle,
  right,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) => (
  <div className={clsx("flex items-end justify-between gap-3", className)}>
    <div className="flex flex-col gap-0.5 min-w-0">
      <h1 className="title-screen truncate">{title}</h1>
      {subtitle && <p className="text-[13px] text-sub leading-snug">{subtitle}</p>}
    </div>
    {right && <div className="shrink-0">{right}</div>}
  </div>
);

/** Small gold all-caps heading with a fading rule, for sections inside a screen. */
export const SectionTitle = ({
  children,
  right,
  className,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) => (
  <div className={clsx("flex items-center gap-3", className)}>
    <h2 className="title-section flex-1 min-w-0">{children}</h2>
    {right && <div className="shrink-0 text-xs font-bold text-muted">{right}</div>}
  </div>
);

/** Segmented tabs. Each tab can carry a red count badge. */
export const Segmented = <T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: React.ReactNode; badge?: number }[];
  value: T;
  onChange: (t: T) => void;
  className?: string;
}) => (
  <div className={clsx("seg", className)} role="tablist">
    {tabs.map((t) => (
      <button
        key={t.id}
        aria-selected={value === t.id}
        className="seg-btn"
        role="tab"
        type="button"
        onClick={() => onChange(t.id)}
      >
        {t.label}
        {!!t.badge && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center bg-ember text-[#FFF4EA] text-micro font-extrabold tabular-nums rounded-full min-w-4 h-4 px-1 ring-2 ring-ink">
            {t.badge > 9 ? "9+" : t.badge}
          </span>
        )}
      </button>
    ))}
  </div>
);

/** Progress bar, gold to ember. */
export const Bar = ({ value, max, className }: { value: number; max: number; className?: string }) => (
  <div className={clsx("bar", className)}>
    <span className="bar-fill" style={{ width: `${max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0}%` }} />
  </div>
);

/** Icon + number, e.g. "⚔️ 1,200". `e` is an emoji that has a painted icon. */
export const Stat = ({
  e,
  children,
  tone,
  className,
}: {
  e?: string;
  children: React.ReactNode;
  tone?: "good" | "bad" | "gold";
  className?: string;
}) => (
  <span
    className={clsx(
      "stat",
      tone === "good" && "text-good",
      tone === "bad" && "text-bad",
      tone === "gold" && "text-goldtext",
      className,
    )}
  >
    {e && <GameIcon e={e} />}
    {children}
  </span>
);

/** Friendly "nothing here yet" block. */
export const EmptyState = ({
  e,
  title,
  children,
  action,
  className,
}: {
  e?: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) => (
  <div className={clsx("card-flat px-5 py-6 flex flex-col items-center text-center gap-2", className)}>
    {e && <span className="text-[34px] leading-none"><GameIcon e={e} /></span>}
    <p className="font-display font-bold text-[15px] text-parch">{title}</p>
    {children && <div className="text-[13px] text-sub leading-snug max-w-[280px]">{children}</div>}
    {action && <div className="pt-1">{action}</div>}
  </div>
);
