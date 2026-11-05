import { expect, test } from "@playwright/test";

import { editState, lateGame, newId, open, sql, toast } from "./helpers";

test.describe("Valorians 2 late game", () => {
  test("a maxed building earns a Mastery star", async ({ page }) => {
    const id = newId();

    await open(page, id, "/hall");
    await editState(id, lateGame);
    const noErrors = await open(page, id, "/tribe");

    await expect(page.getByText(/Mastery 0\/5/).first()).toBeVisible();
    await page.getByRole("button", { name: "Arsenal details" }).click();
    await expect(page.getByText("Mastery", { exact: true })).toBeVisible();
    // No dead upgrade button under it.
    await expect(page.getByRole("button", { name: "Max level" })).toHaveCount(0);
    await page.getByRole("button", { name: /Earn star 1/ }).click();
    await toast(page, "Mastery work started");
    await expect(page.getByText("Mastery star 1")).toBeVisible();
    noErrors();
  });

  test("an outpost is founded, its field raised, and it shows on the map", async ({ page }) => {
    const id = newId();

    await open(page, id, "/hall");
    await editState(id, lateGame);
    const noErrors = await open(page, id, "/tribe");

    // Founding offers the land to choose from, each with its bonus.
    await page.getByRole("button", { name: "Found outpost" }).click();
    await expect(page.getByText("Choose the land to settle")).toBeVisible();
    if (process.env.SHOTS) {
      await page.getByText("Choose the land to settle").evaluate((e) => e.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: `${process.env.SHOTS}/outpost-choose.png` });
    }
    await page.getByRole("button", { name: "Settle" }).first().click();
    await toast(page, "An outpost is founded!");
    await expect(page.getByText("Outpost 1")).toBeVisible();
    // Tapping a field shows its cost and time; Raise starts the outpost's builder.
    await page.getByRole("button", { name: /Lv 0/ }).first().click();
    await page.getByRole("button", { name: "Raise to 1" }).click();
    await toast(page, "The outpost's builder is at work");
    await expect(page.getByText(/→ 1 ·/)).toBeVisible();
    if (process.env.SHOTS) {
      await page.getByText("Outpost 1").evaluate((e) => e.scrollIntoView({ block: "center" }));
      await page.screenshot({ path: `${process.env.SHOTS}/outpost-card.png` });
    }

    const rows = await sql("SELECT x, y FROM outposts WHERE user_id = ?", [id]);
    expect(rows.rows.length).toBe(1);
    noErrors();
  });

  test("the Merchant of the North swaps at 60%", async ({ page }) => {
    const id = newId();

    await open(page, id, "/hall");
    await editState(id, lateGame);
    const noErrors = await open(page, id, "/market?tab=sell");

    await expect(page.getByText("Merchant of the North")).toBeVisible();
    await expect(page.getByText("600 wood")).toBeVisible(); // 1,000 iron → 600 wood
    await page.getByRole("button", { name: "Swap now" }).click();
    await toast(page, "The merchant made the swap");
    noErrors();
  });

  test("training shows the people it takes", async ({ page }) => {
    const id = newId();

    await open(page, id, "/hall");
    await editState(id, (s) => {
      lateGame(s);
      s.population = 0;
    });
    const noErrors = await open(page, id, "/battle?tab=army");

    await page.getByText("Spearman", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Train" })).toBeDisabled(); // no people to recruit
    noErrors();
  });

  test("a clan raises its World Wonder and sees the race", async ({ page }) => {
    const leader = newId();
    const member = newId();

    await open(page, member, "/hall");
    await open(page, leader, "/hall");
    await editState(leader, lateGame);
    const now = Date.now();
    const tag = `W${leader % 10000}`;

    await sql(
      `INSERT INTO clans (name, tag, leader_id, created_at, tech_hall, tech_fields, tech_banners, tech_shieldwall,
         t_iron, t_wood, t_clay, t_crop, t_coins, wonder_level)
       VALUES (?, ?, ?, ?, 5, 5, 5, 5, 9e6, 9e6, 9e6, 9e6, 9e6, 6)`,
      [`Wonder Builders ${leader}`, tag, leader, now]
    );
    const clan = await sql("SELECT id FROM clans WHERE tag = ?", [tag]);
    const clanId = Number(clan.rows[0].id);

    await sql("UPDATE users SET clan_id = ?, clan_joined_at = ? WHERE id IN (?, ?)", [clanId, now - 5 * 86400e3, leader, member]);
    const noErrors = await open(page, leader, "/clan");

    await page.getByText("Treasury", { exact: true }).first().click();
    await expect(page.getByText("Level 6 of 20")).toBeVisible();
    await page.getByRole("button", { name: "Raise the Wonder to 7" }).click();
    await toast(page, "The Wonder rises!");
    await expect(page.getByText("Level 7 of 20")).toBeVisible();
    await expect(page.getByText("The builders are still at work on the last level")).toBeVisible();
    await expect(page.getByText(new RegExp(`\\[${tag}\\]`)).first()).toBeVisible();
    noErrors();
  });

  test("the clan screen has four tabs; banner and other clans open from the header", async ({ page }) => {
    const leader = newId();
    const member = newId();

    await open(page, member, "/hall");
    await open(page, leader, "/hall");
    const now = Date.now();
    const tag = `T${leader % 10000}`;

    await sql("INSERT INTO clans (name, tag, leader_id, created_at) VALUES (?, ?, ?, ?)", [`Four Tabs ${leader}`, tag, leader, now]);
    const clan = await sql("SELECT id FROM clans WHERE tag = ?", [tag]);

    await sql("UPDATE users SET clan_id = ?, clan_joined_at = ? WHERE id IN (?, ?)", [Number(clan.rows[0].id), now, leader, member]);
    const noErrors = await open(page, leader, "/clan");

    await expect(page.getByRole("tab")).toHaveText(["Members", "War", "Treasury", "Log"]);
    await page.screenshot({ path: "test-results/clan-tabs.png" });

    await page.getByRole("button", { name: "Banner & settings" }).click();
    await expect(page.getByRole("button", { name: "Save banner" })).toBeVisible();
    await page.screenshot({ path: "test-results/clan-settings.png" });
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /RANK/i }).click();
    await expect(page.getByPlaceholder("Search by name or tag")).toBeVisible();
    await expect(page.getByText("YOURS")).toBeVisible();
    await page.screenshot({ path: "test-results/clan-explore.png" });
    noErrors();
  });
});
