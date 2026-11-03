import fs from "fs";
import path from "path";

import { Page, expect, test } from "@playwright/test";

import { newId, open } from "./helpers";

/** Everything that goes wrong lands on the one error page, never a white screen. */

test("a link to nowhere shows the lost page, with a way back to the Hall", async ({ page }) => {
  const noErrors = await open(page, newId(), "/no-such-place");

  await expect(page.locator('[data-error-kind="missing"]')).toBeVisible();
  await expect(page.getByText("Lost in the fjords")).toBeVisible();
  await page.getByRole("link", { name: "Back to your Hall" }).click();
  await expect(page).toHaveURL(/\/hall/);
  noErrors();
});

test("when the server can't be reached, the game says so and can try again", async ({ page }) => {
  await page.route("**/api/**", (r) => r.abort());
  await page.goto(`/hall?dev_user=${newId()}`);

  await expect(page.locator('[data-error-kind="offline"]')).toBeVisible();
  await expect(page.getByText("The gates won't open")).toBeVisible();
  await page.unroute("**/api/**");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator('[data-error-kind="offline"]')).toHaveCount(0);
});

// ─── The launcher (outside the host) ───────────────────────────────────────

// http like the local game server (an https page may not call an http one; in production both are https).
const LAUNCHER = "http://launcher.test";
const root = path.join(__dirname, "..");

/**
 * Serves launcher/index.html (and its painting) as if it were on GitHub Pages.
 * Its health check to the local game goes through Playwright: Chromium won't
 * let a public site call localhost directly (in production both are public).
 */
async function serveLauncher(page: Page, game?: string) {
  if (game) await page.route(`${game}/api/health`, async (r) => r.fulfill({ response: await r.fetch() }));
  await page.route(`${LAUNCHER}/**`, (r) => {
    const url = new URL(r.request().url());

    if (url.pathname.endsWith("intro.webp")) {
      return r.fulfill({ body: fs.readFileSync(path.join(root, "public/images/background/intro.webp")), contentType: "image/webp" });
    }
    if (url.pathname.endsWith(".woff2")) return r.fulfill({ status: 404, body: "" });

    return r.fulfill({ body: fs.readFileSync(path.join(root, "launcher/index.html"), "utf8"), contentType: "text/html" });
  });
}

test("launcher: the game is up, so it opens the right screen and keeps Telegram's sign-in data", async ({ page, baseURL }) => {
  await serveLauncher(page, baseURL);
  await page.goto(`${LAUNCHER}/?game=${encodeURIComponent(baseURL!)}&to=%2Fclan#tgWebAppData=test`);

  await expect(page).toHaveURL(new RegExp(`${baseURL!.replace(/[.:/]/g, "\\$&")}/clan#tgWebAppData=test`));
});

test("launcher: the host is down or paused, so it shows the error page and keeps checking", async ({ page }) => {
  await serveLauncher(page);
  // A paused or broken deployment answers with its own page, not the game's health check.
  await page.route("https://game.test/api/health", (r) => r.fulfill({ status: 503, body: "This deployment is temporarily paused", contentType: "text/html" }));
  await page.goto(`${LAUNCHER}/?game=https://game.test`);

  await expect(page.locator('[data-error-kind="down"]')).toBeVisible();
  await expect(page.getByText("The north is quiet")).toBeVisible();
  await expect(page.getByText(/every 20 seconds/)).toBeVisible();
});

test("launcher: down for maintenance, it says so", async ({ page }) => {
  await serveLauncher(page);
  await page.route("https://game.test/api/health", (r) =>
    r.fulfill({ status: 503, json: { ok: false, reason: "maintenance", message: null }, headers: { "access-control-allow-origin": "*" } })
  );
  await page.goto(`${LAUNCHER}/?game=https://game.test`);

  await expect(page.locator('[data-error-kind="maintenance"]')).toBeVisible();
  await expect(page.getByText("Back soon, Chief")).toBeVisible();
});

test("launcher: only opens paths on the game, never another site", async ({ page, baseURL }) => {
  await serveLauncher(page, baseURL);
  await page.goto(`${LAUNCHER}/?game=${encodeURIComponent(baseURL!)}&to=${encodeURIComponent("//evil.test/x")}`);

  await expect(page).toHaveURL(new RegExp(`${baseURL!.replace(/[.:/]/g, "\\$&")}/hall`));
});
