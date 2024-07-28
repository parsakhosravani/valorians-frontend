import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.tsx"],
  theme: {
    extend: {
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
