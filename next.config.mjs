import fs from "fs";

const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Shown on the loading screen so players and support can tell builds apart.
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_ID: sha ? sha.slice(0, 7) : "dev",
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString().slice(0, 10),
  },
  typedRoutes: true,
  // Memoizes components automatically, so state updates only re-render what changed.
  reactCompiler: true,
  // Database client uses native bindings for local files; keep it out of the bundle.
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
