/**
 * Side-effect import: loads `.env.local` then `.env` into process.env BEFORE
 * any module that reads them at top level (e.g. src/db/index.ts).
 *
 * Used by standalone scripts in this folder. Import this FIRST in the
 * script file:
 *
 *   import "./_load-env";
 *   import { db } from "../src/db";
 *   ...
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
