import { expect, test } from "@playwright/test";

import { newId, open, toast } from "./helpers";

test("a new tribe starts with the Town Hall, and locked buildings say what they need", async ({ page }) => {
  const id = newId();
  const noErrors = await open(page, id, "/tribe");

  // Nothing but the Town Hall and the economy can start yet.
  await expect(page.getByText("Needs Town Hall 1").first()).toBeVisible();
  await page.getByRole("button", { name: "Town Hall details" }).click();
  await page.getByRole("button", { name: "Upgrade" }).click();
  await toast(page, "Construction started");
  // The job can be cancelled with a full refund in its first minute.
  await expect(page.getByRole("button", { name: /Cancel \(full refund\)/ })).toBeVisible();
  await page.getByRole("button", { name: /Cancel \(full refund\)/ }).click();
  await toast(page, "Cancelled, resources returned");
  noErrors();
});

test("the leaderboard opens on Power", async ({ page }) => {
  const noErrors = await open(page, newId(), "/leaderboard");

  await expect(page.getByText(/your rank/i)).toBeVisible();
  await expect(page.getByText("Power", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/#\d+/).first()).toBeVisible();
  noErrors();
});
