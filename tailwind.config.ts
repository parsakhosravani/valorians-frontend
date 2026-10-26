import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.tsx"],
  theme: {
    extend: {
      keyframes: {
        lightning: {
          "0%, 88%, 100%": { opacity: "0" },
          "89%": { opacity: "0.55" },
          "90%": { opacity: "0.1" },
          "91.5%": { opacity: "0.45" },
          "94%": { opacity: "0" },
        },
        float: {
          "0%, 100%": { transform: "translate(-50%, 0)" },
          "50%": { transform: "translate(-50%, -5px)" },
        },
        flame: {
          "0%": { transform: "scale(1, 1)" },
          "100%": { transform: "scale(0.9, 1.15)" },
        },
        kenburns: {
          "0%": { transform: "scale(1.05) translateY(0)" },
          "100%": { transform: "scale(1.15) translateY(-2%)" },
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
        route: {
          to: { strokeDashoffset: "-18" },
        },
        trot: {
          "0%, 100%": { translate: "0 0" },
          "50%": { translate: "0 -2px" },
        },
        sail: {
          "0%, 100%": { rotate: "-6deg", translate: "0 0" },
          "50%": { rotate: "6deg", translate: "0 -1px" },
        },
        scale: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.02)" },
        },
        clash: {
          "0%, 100%": { transform: "rotate(-8deg) scale(1)" },
          "45%": { transform: "rotate(10deg) scale(1.12)" },
          "55%": { transform: "rotate(10deg) scale(1.12)" },
        },
      },
      animation: {
        route: "route 1.2s linear infinite",
        trot: "trot 0.6s ease-in-out infinite",
        clash: "clash 0.9s ease-in-out infinite",
        sail: "sail 1.8s ease-in-out infinite",
        float: "float 2.2s ease-in-out infinite",
        flame: "flame 0.9s ease-in-out infinite alternate",
        kenburns: "kenburns 24s ease-in-out infinite alternate",
        ember: "ember 8s linear infinite",
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
