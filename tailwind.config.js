import { nextui } from "@nextui-org/theme";

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@nextui-org/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        intro:
          "url('https://s3-alpha-sig.figma.com/img/d905/0762/c4c97cb500dabbfec2ab8f24c7c81a65?Expires=1722211200&Key-Pair-Id=APKAQ4GOSFWCVNEHN3O4&Signature=XlR-BU1~tty5-stTlo7HPwVaw5eUPh4j0vYoQECNWE~W1GcCFE5UauReFcqkSCSM6RJQ9vPOe7HoAqP2CW6wOJ0R7520zZfnfeQnhoWIcNkUB11aLrlCjZkLXoC32-9w1KJII8RhXe4pU5jAJKeqiqCup0B6EnwTBqQnr0X7Kv5KONctoR1s4TmAUb7Tzkx-TY7YYlckgb8NRwlK3~mcJOte3AqvkmyhSRiC1tItA8uTI6vUBrKSffJOrW9AFh9gju8X9kNOwUa6Yp~yCMEhi1MMjn54NjTOMyQmv3YNjg4NXUfZjW9Lg2KUyHnslUz-~KCFnMJV19gCg1J6r3oh9w__')",
      },
    },
  },

  darkMode: "class",
  plugins: [nextui()],
};
