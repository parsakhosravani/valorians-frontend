import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "node_modules/**", "public/**", "next-env.d.ts"],
  },
  {
    rules: {
      // Server errors go to the log on purpose; anything else is a leftover.
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "off",
      // `_name` marks something left out on purpose (e.g. `const { old: _old, ...rest } = x`).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      // The game draws its own art with plain <img>; next/image adds nothing for small sprites.
      "@next/next/no-img-element": "off",
      // Game copy uses plain apostrophes in JSX text.
      "react/no-unescaped-entities": "off",
      // React Compiler checks. The compiler skips (doesn't break) components that
      // trip these, so they're warnings to clean up over time, not build blockers.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
    },
  },
];

export default config;
