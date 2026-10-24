/**
 * Valorians design tokens — the single source for colour, type, radius and
 * elevation. tailwind.config.ts builds its theme from this file, and the
 * art kit's material colours (src/art/palette.ts) follow the same warm,
 * earthy ramp.
 *
 * Naming: `ink` is the dark UI surface ramp, `parch` the text ramp, then
 * accent families (gold, ember) and status colours.
 */

export const color = {
  ink: {
    950: "#0E0B08",
    900: "#15110D", // app background
    800: "#1F1913", // card
    700: "#2A221A", // raised card, inputs
    600: "#362C22", // pressed / hover
    500: "#4A3D2F", // borders
    400: "#695640", // strong borders, dividers on raised
  },
  parch: {
    50: "#FBF6EC",
    100: "#F4ECDD", // primary text
    300: "#D6C7AC", // secondary text
    500: "#A8977D", // muted text, captions
    700: "#7A6A54", // disabled text
  },
  gold: {
    200: "#FCE3A6",
    300: "#F7D58A", // gold text on dark
    400: "#F0BE5A", // primary accent
    500: "#E0A63C",
    600: "#C48A2A",
    800: "#6E4F1A",
  },
  ember: {
    300: "#FFB08A",
    400: "#EE7448",
    500: "#DB5A2E", // danger / attack
    700: "#8E3517",
    900: "#3A170C",
  },
  moss: { 300: "#BFE29A", 400: "#9CCB72", 600: "#5E8A3E", 900: "#1E2C16" },
  blood: { 300: "#F5A795", 400: "#EB7B62", 600: "#B4442E", 900: "#3A1610" },
  sky: { 300: "#A9CCE6", 400: "#7DB3D6", 600: "#3F7AA6", 900: "#12263A" },
  /** One colour per resource, used for chips, bars and charts. */
  res: {
    coin: "#F0BE5A",
    iron: "#9FAAB6",
    wood: "#C08A52",
    clay: "#D4704A",
    crop: "#E2C254",
    population: "#9FB8D0",
  },
} as const;

export const font = {
  display: ['"Grenze"', "Georgia", "serif"],
  body: ['"Nunito"', "system-ui", "sans-serif"],
} as const;

/** [size, line-height] pairs; display sizes use the Grenze face. */
export const type = {
  "display-xl": ["34px", "1"],
  "display-lg": ["26px", "1.05"],
  "display-md": ["20px", "1.1"],
  title: ["16px", "1.25"],
  body: ["15px", "1.4"],
  small: ["13px", "1.35"],
  caption: ["11px", "1.3"],
} as const;

/** Radii map to Tailwind: sm = rounded-lg, md = rounded-xl, lg = rounded-2xl, xl = rounded-3xl. */
export const radius = { sm: "8px", md: "12px", lg: "16px", xl: "24px", pill: "999px" } as const;

export const shadow = {
  card: "inset 0 1px 0 rgba(255,236,200,0.05), 0 6px 18px rgba(0,0,0,0.35)",
  raised: "inset 0 1px 0 rgba(255,236,200,0.08), 0 10px 24px rgba(0,0,0,0.45)",
  /** Pressed-in look for primary buttons (bottom lip). */
  button: "inset 0 -3px 0 rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.35)",
  glow: "0 0 0 1px rgba(240,190,90,0.6), 0 0 22px rgba(240,190,90,0.28)",
  danger: "0 0 0 1px rgba(219,90,46,0.6), 0 0 22px rgba(219,90,46,0.3)",
} as const;

export const motion = {
  fast: "120ms",
  base: "200ms",
  slow: "320ms",
  ease: "cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;
