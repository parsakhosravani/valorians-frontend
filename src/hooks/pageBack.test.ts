import { expect, test } from "bun:test";

import { pageBack } from "./pageBack";

test("the Hall is home: no back button there", () => {
  expect(pageBack("/hall", 5)).toBe("none");
  expect(pageBack("/", 1)).toBe("none");
});

test("every tab goes back to the Hall, Build and War included", () => {
  for (const tab of ["/tribe", "/battle", "/clan", "/resources"]) expect(pageBack(tab, 4)).toBe("hall");
});

test("pages opened from somewhere go back there, or to the Hall when opened straight from a link", () => {
  expect(pageBack("/leaderboard", 3)).toBe("back");
  expect(pageBack("/market", 2)).toBe("back");
  expect(pageBack("/quest", 1)).toBe("hall");
});
