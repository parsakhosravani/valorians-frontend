import { expect, test } from "@playwright/test";

import { newId, open } from "./helpers";

/** Every screen opens for a brand-new tribe without a crash, and shows what it's for. */
const SCREENS: [string, RegExp][] = [
  ["/hall", /Next steps/i],
  ["/tribe", /Builders/i],
  ["/battle", /Map/i],
  ["/battle?tab=army", /Spearman/i],
  ["/clan", /clan/i],
  ["/resources", /Mine|strike/i],
  ["/market", /Market/i],
  ["/leaderboard", /Leaderboard/i],
  ["/quest", /Sagas/i],
];

test.describe("every screen opens", () => {
  const id = newId();

  for (const [path, shows] of SCREENS) {
    test(path, async ({ page }) => {
      const noErrors = await open(page, id, path);

      await expect(page.getByText(shows).first()).toBeVisible();
      noErrors();
    });
  }
});
