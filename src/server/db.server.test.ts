import "@/server/testing/harness";
import { afterEach, describe, expect, test } from "bun:test";

import { fetchRetrying, neverConnected } from "@/server/db";

const real = globalThis.fetch;
const connectTimeout = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
const cutMidway = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });

afterEach(() => {
  globalThis.fetch = real;
});

describe("reaching the database", () => {
  test("a connection that was never made is tried once more", async () => {
    let calls = 0;

    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) throw connectTimeout();

      return new Response("ok");
    }) as unknown as typeof fetch;
    expect(await (await fetchRetrying("https://db.example")).text()).toBe("ok");
    expect(calls).toBe(2);
  });

  test("a connection cut midway is not sent again (the statement may have run)", async () => {
    let calls = 0;

    globalThis.fetch = (async () => {
      calls++;
      throw cutMidway();
    }) as unknown as typeof fetch;
    await expect(fetchRetrying("https://db.example")).rejects.toThrow("fetch failed");
    expect(calls).toBe(1);
  });

  test("gives up after the retry, and the error says the database was never reached", async () => {
    let calls = 0;

    globalThis.fetch = (async () => {
      calls++;
      throw connectTimeout();
    }) as unknown as typeof fetch;
    const e = await fetchRetrying("https://db.example").catch((x) => x);

    expect(calls).toBe(2);
    expect(neverConnected(e)).toBe(true);
    expect(neverConnected(cutMidway())).toBe(false);
    expect(neverConnected(new Error("boom"))).toBe(false);
  });
});
