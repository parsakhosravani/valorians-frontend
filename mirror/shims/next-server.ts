/**
 * Stand-in for "next/server" in the mirror bundle. Routes only use
 * NextResponse.json, the request's headers/json()/nextUrl, and after().
 */
const pending: Array<() => unknown> = [];

/** Next runs these after the response. In the isolate we run them before returning (see entry.ts). */
export function after(fn: () => unknown) {
  pending.push(fn);
}

export async function runAfterTasks() {
  while (pending.length) {
    const fn = pending.shift()!;

    try {
      await fn();
    } catch (e) {
      console.error("after() task failed", e);
    }
  }
}

export class NextResponse {
  static json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
    return new Response(JSON.stringify(data), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
  }
}

export type NextRequest = MirrorRequest;

/** The request object routes receive, built from a Serverless endpoint call. */
export type MirrorRequest = {
  method: string;
  url: string;
  headers: { get(name: string): string | null };
  nextUrl: { pathname: string; searchParams: { get(name: string): string | null; has(name: string): boolean } };
  json(): Promise<any>;
};

export function makeRequest(opts: {
  method: string;
  path: string;
  query: string;
  body: unknown;
  headers: Record<string, string>;
}): MirrorRequest {
  const params = new Map<string, string>();

  for (const part of opts.query.split("&")) {
    if (!part) continue;
    const [k, v = ""] = part.split("=");

    params.set(decodeURIComponent(k.replace(/\+/g, " ")), decodeURIComponent(v.replace(/\+/g, " ")));
  }
  const headers = new Map(Object.entries(opts.headers).map(([k, v]) => [k.toLowerCase(), v]));

  return {
    method: opts.method,
    url: `/api/${opts.path}${opts.query ? `?${opts.query}` : ""}`,
    headers: { get: (n) => headers.get(n.toLowerCase()) ?? null },
    nextUrl: {
      pathname: `/api/${opts.path}`,
      searchParams: { get: (n) => params.get(n) ?? null, has: (n) => params.has(n) },
    },
    json: async () => {
      if (opts.body === null || opts.body === undefined) throw new SyntaxError("No body");

      return opts.body;
    },
  };
}
