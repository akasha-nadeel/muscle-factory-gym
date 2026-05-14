import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false });

  const dir = "drizzle";
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const f of files) {
    const path = join(dir, f);
    const contents = readFileSync(path, "utf8");
    const statements = contents
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    console.log(`Applying ${f} (${statements.length} statements)...`);
    for (const stmt of statements) {
      await sql.unsafe(stmt);
    }
    console.log(`  ✓ ${f}`);
  }

  await sql.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
