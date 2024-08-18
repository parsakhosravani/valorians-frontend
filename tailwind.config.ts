import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.tsx"],
  theme: {
    extend: {
      keyframes: {
        moveUpAndFade: {
          "0%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(-70px)", opacity: "0" },
        },
        scale: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.02)" },
        },
      },
      animation: {
        "touch-animation": "scale .2s linear infinite",
        "mine-animation": "moveUpAndFade 0.6s forwards ease-out",
      },
      backgroundColor: {
        buildingBg: "rgba(99, 147, 212, 0.15)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
export default config;
