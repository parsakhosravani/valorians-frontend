import { describe, expect, test } from "bun:test";

import { noticeParts, noticePlain } from "./noticeText";

describe("notice text", () => {
  test("bold pieces and escaped names come out as plain text", () => {
    const html = "🗼 <b>Your Watchtower caught a spy</b> sent by <b>&lt;Tom &amp; Co&gt;</b>.";

    expect(noticeParts(html)).toEqual([
      { text: "🗼 ", bold: false },
      { text: "Your Watchtower caught a spy", bold: true },
      { text: " sent by ", bold: false },
      { text: "<Tom & Co>", bold: true },
      { text: ".", bold: false },
    ]);
    expect(noticePlain(html)).toBe("🗼 Your Watchtower caught a spy sent by <Tom & Co>.");
  });
});
