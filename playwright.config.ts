import { defineConfig, devices } from "@playwright/test";
import os from "os";
import path from "path";

/**
 * Browser tests: the real game in Chromium, signed in with the dev login, on a
 * throwaway SQLite file. `bun run e2e` starts the dev server itself.
 */
export const E2E_DB = path.join(os.tmpdir(), "valorians-e2e", "e2e.db");
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["iPhone 13"],
    // Chromium for every device: one browser to install in CI.
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `bun run dev --port ${PORT}`,
    url: `http://localhost:${PORT}/hall`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_DEV_LOGIN: "true",
      DATABASE_PATH: E2E_DB,
      TURSO_DATABASE_URL: "",
      TELEGRAM_BOT_TOKEN: "",
      NOTIFICATIONS: "off",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
