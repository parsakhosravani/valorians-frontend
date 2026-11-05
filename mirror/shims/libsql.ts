/**
 * Stand-in for "@libsql/client" in the mirror: the same execute/batch/
 * executeMultiple calls src/server uses, answered by Telegram Serverless'
 * built-in SQLite (`db` from the SDK).
 *
 * Differences that matter:
 * - `batch` runs its statements one after another, not as one transaction.
 *   The game already guards its writes with optimistic locking (version
 *   columns), so a crash between two statements leaves at worst a stale
 *   cached column, which the next refresh fixes.
 * - The SDK takes named parameters, so `?` placeholders become `:p1, :p2…`.
 */
import { db } from "sdk";

type Args = unknown[] | Record<string, unknown>;
type InStatement = string | { sql: string; args?: Args };

export type Row = Record<string, unknown>;
export type ResultSet = {
  rows: Row[];
  columns: string[];
  rowsAffected: number;
  lastInsertRowid: number | undefined;
};
export type Client = ReturnType<typeof createClient>;

/** Rewrites `?` (outside quotes and comments) into named parameters. */
export function toNamed(sql: string, args: Args = []): [string, Record<string, unknown>] {
  const params: Record<string, unknown> = {};

  if (!Array.isArray(args)) {
    for (const [k, v] of Object.entries(args)) params[/^[:@$]/.test(k) ? k : `:${k}`] = v;

    return [sql, params];
  }
  let out = "";
  let n = 0;
  let quote: string | null = null;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];

    if (quote) {
      out += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      out += c;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;

      out += sql.slice(i, stop);
      i = stop - 1;
      continue;
    }
    if (c === "?") {
      // `?NNN` (numbered) isn't used by the game; plain `?` only.
      n++;
      out += `:p${n}`;
      params[`:p${n}`] = args[n - 1];
      continue;
    }
    out += c;
  }

  return [out, params];
}

const READS = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN|VALUES)\b/i;

/** SQLite takes no booleans/undefined; libsql turned them into 1/0/NULL for us. */
function clean(params: Record<string, unknown>) {
  for (const k of Object.keys(params)) {
    const v = params[k];

    if (v === undefined) params[k] = null;
    else if (typeof v === "boolean") params[k] = v ? 1 : 0;
    else if (typeof v === "bigint") params[k] = Number(v);
  }

  return params;
}

async function execute(stmt: InStatement): Promise<ResultSet> {
  const { sql, args } = typeof stmt === "string" ? { sql: stmt, args: [] as Args } : stmt;
  const [q, params] = toNamed(sql, args ?? []);

  if (READS.test(q) && !/\bRETURNING\b/i.test(q)) {
    const rows = ((await (db as any).all(q, clean(params))) ?? []) as Row[];

    return { rows, columns: Object.keys(rows[0] ?? {}), rowsAffected: 0, lastInsertRowid: undefined };
  }
  const r = (await (db as any).run(q, clean(params))) as { rows?: Row[]; rowsAffected?: number; lastInsertRowid?: number };
  const rows = r?.rows ?? [];

  return {
    rows,
    columns: Object.keys(rows[0] ?? {}),
    rowsAffected: Number(r?.rowsAffected ?? 0),
    lastInsertRowid: r?.lastInsertRowid == null ? undefined : Number(r.lastInsertRowid),
  };
}

/** Splits a multi-statement script on `;` outside quotes, dropping comment-only parts. */
export function splitStatements(script: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;

  for (let i = 0; i < script.length; i++) {
    const c = script[i];

    if (quote) {
      cur += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "-" && script[i + 1] === "-") {
      const end = script.indexOf("\n", i);

      i = (end === -1 ? script.length : end) - 1;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    if (c === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());

  return out;
}

export function createClient(_config?: unknown) {
  return {
    execute,
    async batch(stmts: InStatement[], _mode?: string) {
      const out: ResultSet[] = [];

      for (const s of stmts) out.push(await execute(s));

      return out;
    },
    async executeMultiple(script: string) {
      for (const s of splitStatements(script)) await execute(s);
    },
    close() {},
  };
}
