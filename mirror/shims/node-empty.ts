/**
 * Stand-in for "fs" and "path" in the mirror. db.ts only touches them when it
 * falls back to a local SQLite file, which never happens here (the libsql shim
 * ignores the URL), so these just have to exist.
 */
const fs = { mkdirSync() {}, existsSync: () => false, readFileSync: () => "" };
const path = {
  join: (...p: string[]) => p.join("/"),
  dirname: (p: string) => p.split("/").slice(0, -1).join("/") || "/",
  resolve: (...p: string[]) => p.join("/"),
};

export default { ...fs, ...path };
export const { mkdirSync, existsSync, readFileSync } = fs;
export const { join, dirname, resolve } = path;
