// Mirror prelude (from mirror/shims/prelude.js): runs before any bundled module,
// because some read process.env at load time. Telegram Serverless is a bare V8
// isolate, not Node, so this fills in the few globals the game's server uses.
(() => {
  const g = globalThis;
  g.process ??= { env: {} };
  g.process.env = { ...(g.process.env ?? {}), ...__MIRROR_ENV__ };
  if (typeof g.setTimeout !== "function") {
    // No timers: waits (retry jitter, send pacing) just yield.
    g.setTimeout = (fn) => { Promise.resolve().then(fn); return 0; };
    g.clearTimeout = () => {};
  }
  if (typeof g.AbortSignal === "undefined") g.AbortSignal = {};
  if (typeof g.AbortSignal.timeout !== "function") g.AbortSignal.timeout = () => undefined;
  if (typeof g.Response === "undefined") {
    // Just enough of the web Response for NextResponse.json and our callers.
    g.Response = class Response {
      constructor(body, init = {}) {
        this._text = body ?? "";
        this.status = init.status ?? 200;
        this.ok = this.status >= 200 && this.status < 300;
        this.bodyUsed = false;
        const h = new Map(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
        this.headers = { get: (k) => h.get(String(k).toLowerCase()) ?? null, has: (k) => h.has(String(k).toLowerCase()) };
      }
      async text() { this.bodyUsed = true; return this._text; }
      async json() { return JSON.parse(await this.text()); }
    };
  }
})();
