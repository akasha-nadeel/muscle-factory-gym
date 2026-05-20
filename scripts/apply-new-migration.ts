/**
 * Applies a single migration file (the one passed via CLI arg).
 *   npx tsx scripts/apply-new-migration.ts drizzle/0005_shocking_omega_red.sql
 *
 * Unlike apply-migration.ts (which tries to re-run ALL migrations and
 * fails on duplicate-object errors), this one runs just the file you
 * specify. Use after `npm run db:generate` produces a new file.
 */
import "./_load-env";
import postgres from "postgres";
import { readFileSync } from "node:fs";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npx tsx scripts/apply-new-migration.ts <path-to-sql>");
    process.exit(1);
  }
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false });
  const contents = readFileSync(file, "utf8");
  const statements = contents
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  console.log(`Applying ${file} (${statements.length} statements)...`);
  for (const stmt of statements) {
    await sql.unsafe(stmt);
  }
  console.log("Done.");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
