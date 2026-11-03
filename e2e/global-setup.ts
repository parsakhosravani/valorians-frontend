import fs from "fs";
import path from "path";

import { E2E_DB } from "../playwright.config";

/** Every run starts from an empty database. */
export default function globalSetup() {
  fs.rmSync(path.dirname(E2E_DB), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(E2E_DB), { recursive: true });
}
