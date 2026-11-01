/**
 * Points the server at a throwaway SQLite file and switches the bot off.
 * Its own module so it runs before any other import of the harness.
 */
import fs from "fs";
import os from "os";
import path from "path";

if (!globalThis.__valoriansDb) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "valorians-test-"));

  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_PATH = path.join(dir, "test.db");
  // No bot in tests: notifications and other Telegram calls skip themselves.
  process.env.TELEGRAM_BOT_TOKEN = "";
  delete process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
}
