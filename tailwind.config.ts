import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.tsx"],
  theme: {
    extend: {
      backgroundImage: {
        intro: "url('/images/background/intro.webp')",
      },
    },
  },
  plugins: [],
};
export default config;
