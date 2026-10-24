import type { Config } from "tailwindcss";

import { color, font, shadow, type } from "./src/design/tokens";

const config: Config = {
  content: ["./src/**/*.tsx"],
  theme: {
    extend: {
      colors: {
        ink: color.ink,
        parch: { DEFAULT: color.parch[100], ...color.parch },
        gold: { DEFAULT: color.gold[400], ...color.gold },
        ember: { DEFAULT: color.ember[500], ...color.ember },
        moss: color.moss,
        blood: color.blood,
        sky: color.sky,
        res: color.res,

        // Semantic aliases (older screens use these names).
        ground: color.ink[900],
        panel: color.ink[800],
        panel2: color.ink[700],
        line: color.ink[500],
        goldtext: color.gold[300],
        sub: color.parch[300],
        muted: color.parch[500],
        good: color.moss[400],
        bad: color.blood[400],
      },
      fontFamily: {
        display: [...font.display],
        sans: [...font.body],
      },
      fontSize: Object.fromEntries(Object.entries(type).map(([k, [s, l]]) => [k, [s, { lineHeight: l }]])),
      boxShadow: shadow,
      keyframes: {
        float: {
          "0%, 100%": { transform: "translate(-50%, 0)" },
          "50%": { transform: "translate(-50%, -5px)" },
        },
        flame: {
          "0%": { transform: "scale(1, 1)" },
          "100%": { transform: "scale(0.9, 1.15)" },
        },
        smoke: {
          "0%": { transform: "translateY(4px) scale(0.6)", opacity: "0" },
          "30%": { opacity: "0.7" },
          "100%": { transform: "translateY(-10px) scale(1.2)", opacity: "0" },
        },
        kenburns: {
          "0%": { transform: "scale(1.02) translateY(0)" },
          "100%": { transform: "scale(1.1) translateY(-2%)" },
        },
        ember: {
          "0%": { transform: "translateY(0) translateX(0)", opacity: "0" },
          "10%": { opacity: "0.9" },
          "100%": { transform: "translateY(-95vh) translateX(20px)", opacity: "0" },
        },
        moveUpAndFade: {
          "0%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(-70px)", opacity: "0" },
        },
        scale: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.02)" },
        },
        rise: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        float: "float 2.2s ease-in-out infinite",
        flame: "flame 0.9s ease-in-out infinite alternate",
        smoke: "smoke 3.2s ease-out infinite",
        kenburns: "kenburns 24s ease-in-out infinite alternate",
        ember: "ember 8s linear infinite",
        rise: "rise 0.32s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "touch-animation": "scale .2s linear infinite",
        "mine-animation": "moveUpAndFade 0.6s forwards ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
