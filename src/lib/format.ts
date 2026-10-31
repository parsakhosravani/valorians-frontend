/** 3725000 → "1h 2m 5s"; drops leading zero units. */
export function formatDuration(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

// One formatter each, made once: building an Intl.NumberFormat is slow on a
// phone, and counters on every screen format numbers every second.
// (`n.toLocaleString("en-US")` builds a new one on every call, too.)
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const GROUPED = new Intl.NumberFormat("en-US");

/** 15300 → "15.3K" */
export function compact(n: number) {
  return COMPACT.format(Math.floor(n));
}

/** 15300 → "15,300", the same as `n.toLocaleString("en-US")`. */
export function grouped(n: number) {
  return GROUPED.format(n);
}

/** Whole and grouped: 15300.7 → "15,300". How counts and amounts are shown everywhere. */
export const whole = (n: number) => GROUPED.format(Math.floor(n));
