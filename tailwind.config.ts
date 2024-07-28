import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.tsx"],
  theme: {
    extend: {
      backgroundColor: {
        buildingBg: "rgba(99, 147, 212, 0.15)",
      },
      backdropBlur: {
        xs: "2px",
      },
      backgroundImage: {
        intro: "url('/images/background/intro.svg')",
        tribe: "url('/images/background/tribe.webp')",
        battle: "url('/images/background/battle.webp')",
        friends: "url('/images/background/friends.webp')",
        quest: "url('/images/background/quest.webp')",
      },
    },
  },
  plugins: [],
};
export default config;
