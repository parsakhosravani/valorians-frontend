import { expect, test } from "@playwright/test";

import { editState, newId, open, stateOf, toast } from "./helpers";

/**
 * The game's core journeys, end to end through the real screens and checked
 * against what the server saved: if one of these breaks, players can't play.
 */

test("daily reward: claiming day 1 pays its coins, once", async ({ page }) => {
  const id = newId();
  const noErrors = await open(page, id, "/hall");
  const before = (await stateOf(id)).coins;

  await page.getByRole("button", { name: "Claim" }).first().click();
  await toast(page, "Reward claimed!");
  await expect.poll(async () => (await stateOf(id)).coins).toBeGreaterThanOrEqual(before + 200);
  await expect(page.getByRole("button", { name: "Claim" })).toHaveCount(0); // not twice in a day
  noErrors();
});

test("Daily Mine: strikes turn stamina into resources on the server", async ({ page }) => {
  const id = newId();
  const noErrors = await open(page, id, "/resources");
  const before = await stateOf(id);
  const rock = page.getByRole("button", { name: /^Mine / });

  for (let i = 0; i < 15; i++) await rock.click({ delay: 20 });
  // Strikes are sent in batches: wait for the server to have them.
  await expect.poll(async () => (await stateOf(id)).energy, { timeout: 15_000 }).toBeLessThan(before.energy);
  const after = await stateOf(id);
  const gained = (["iron", "wood", "clay", "crop"] as const).some((r) => after.resources[r] > before.resources[r] + 100);

  expect(gained).toBe(true);
  noErrors();
});

test("first build: the Town Hall goes up, finishes free, and opens the Barracks", async ({ page }) => {
  const id = newId();
  const noErrors = await open(page, id, "/tribe");

  await page.getByRole("button", { name: "Town Hall details" }).click();
  await page.getByRole("button", { name: "Upgrade" }).click();
  await toast(page, "Construction started");
  // Level 1 takes about a minute: well inside the free finish.
  await page.getByRole("button", { name: "Finish free" }).click();
  await toast(page, "Done!");
  await expect.poll(async () => (await stateOf(id)).buildings["town-hall"]).toBe(1);
  await page.keyboard.press("Escape");
  await open(page, id, "/tribe");
  await page.getByRole("button", { name: "Barracks details" }).click();
  // The drawer's big button (the list has small ones too).
  await expect(page.getByRole("button", { name: "Upgrade" }).last()).toBeEnabled();
  noErrors();
});

test("training: recruits come from the people and wait in the queue", async ({ page }) => {
  const id = newId();

  await open(page, id, "/hall");
  await editState(id, (s) => {
    s.buildings["town-hall"] = 1;
    s.buildings.barracks = 1;
    s.population = 50;
  });
  const noErrors = await open(page, id, "/battle?tab=army");

  await page.getByText("Spearman", { exact: true }).click();
  await page.getByRole("button", { name: "Train" }).click();
  await toast(page, "Training started");
  const s = await stateOf(id);

  expect(s.training.length).toBe(1);
  expect(s.population).toBeLessThan(50);
  noErrors();
});

test("Valorians Plus: the free trial switches on, once", async ({ page }) => {
  const id = newId();
  const noErrors = await open(page, id, "/hall");

  await page.getByRole("button", { name: /Try Plus free/ }).click();
  await page.getByRole("button", { name: /Try free for/ }).click();
  await toast(page, /Plus is on/);
  const s = await stateOf(id);

  expect(s.plus.until).toBeGreaterThan(Date.now());
  expect(s.plus.trialUsed).toBe(true);
  noErrors();
});

test("clans: one chief founds a clan, another joins and donates to its treasury", async ({ page, browser }) => {
  const founder = newId();
  const tag = `T${String(founder).slice(-4)}`;
  const noErrors = await open(page, founder, "/clan");

  await page.getByText("Found a clan", { exact: true }).click();
  await page.getByPlaceholder("Sons of the North").fill(`Ravens ${founder}`);
  await page.getByPlaceholder("SOTN").fill(tag);
  await page.getByRole("button", { name: "Found clan" }).click();
  await toast(page, "Clan founded!");
  await expect(page.getByText(`Ravens ${founder}`).first()).toBeVisible();
  noErrors();

  const other = await browser.newPage();
  const joiner = newId();
  const noErrors2 = await open(other, joiner, "/clan");

  await other.getByPlaceholder("Search by name or tag").fill(tag);
  await other.getByRole("button", { name: "Join" }).first().click();
  await expect(other.getByText(`Ravens ${founder}`).first()).toBeVisible();
  await other.getByText("Treasury", { exact: true }).first().click();
  await other.getByPlaceholder("Amount").fill("500");
  await other.getByRole("button", { name: /^Donate/ }).click();
  await toast(other, "Donated to the treasury");
  noErrors2();
  await other.close();
});

test("market: one tribe posts an offer, another buys it, merchants set off", async ({ page, browser }) => {
  const seller = newId();
  const buyer = newId();
  const withPost = (s: Parameters<Parameters<typeof editState>[1]>[0]) => {
    s.buildings["resource-warehouse"] = 3;
    s.buildings["trading-post"] = 1;
  };

  await open(page, seller, "/hall");
  await editState(seller, withPost);
  const noErrors = await open(page, seller, "/market?tab=sell");

  await page.getByRole("button", { name: "Post offer" }).click();
  await toast(page, "Offer posted on the market");
  noErrors();

  const other = await browser.newPage();

  await open(other, buyer, "/hall");
  await editState(buyer, withPost);
  const noErrors2 = await open(other, buyer, "/market");

  await other.getByRole("button", { name: "Trade" }).first().click();
  await toast(other, "Deal! Merchants are on their way");
  noErrors2();
  await other.close();
});
