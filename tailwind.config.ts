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
      colors: {
        ground: "#120D09",
        panel: "#1E1610",
        panel2: "#2A1F16",
        line: "#4A3624",
        gold: "#E3A948",
        goldtext: "#F2C66D",
        ember: "#E8612C",
        parch: "#EFE3CC",
        sub: "#D8C9AE",
        muted: "#B19C80",
        good: "#9DD07F",
        bad: "#F08A6C",
      },
      fontFamily: {
        display: ["Cinzel", "Georgia", "serif"],
      },
      backgroundColor: {
        buildingBg: "rgba(30, 22, 16, 0.92)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
export default config;
