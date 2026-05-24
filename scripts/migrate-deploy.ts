/**
 * Idempotent migration runner — safe to run on every Vercel deploy.
 *
 * Wired in via `package.json` "prebuild" so it runs automatically before
 * `next build` both locally and on Vercel.
 *
 * Logic:
 *   1. Connect via DIRECT_DATABASE_URL (fallback: DATABASE_URL). pgBouncer
 *      transaction-pooling breaks some DDL, so the direct URL is preferred.
 *   2. Ensure `_app_migrations` ledger table exists.
 *   3. If ledger is empty, backfill based on schema introspection so we
 *      don't try to re-create tables that already exist on long-running
 *      deployments (dev = 0000-0008 applied, prod = 0000-0006 applied).
 *   4. Iterate sorted .sql files in drizzle/, skip any already in the
 *      ledger, apply the rest (split on `--> statement-breakpoint`), and
 *      record each applied file in the ledger.
 *   5. On failure, log the file + offending statement and exit 1 so the
 *      Vercel build fails fast.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "drizzle";

async function main() {
  const connStr = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connStr) {
    console.error(
      "[migrate] Missing DIRECT_DATABASE_URL / DATABASE_URL — cannot run migrations.",
    );
    process.exit(1);
  }

  const sql = postgres(connStr, { prepare: false, max: 1 });

  try {
    // 1. Ensure ledger table
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS _app_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // 2. Discover migration files (sorted gives 0000, 0001, ...)
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.log("[migrate] No .sql files found in drizzle/ — nothing to do.");
      return;
    }

    // 3. Backfill ledger on first run against an existing DB
    const ledgerCount = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM _app_migrations
    `;
    if (Number(ledgerCount[0].count) === 0) {
      const profilesExists = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'profiles'
        ) AS exists
      `;

      if (!profilesExists[0].exists) {
        console.log(
          "[migrate] Fresh DB detected (no profiles table) — applying all migrations from scratch.",
        );
      } else {
        const gymSeq = await sql<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_sequences WHERE sequencename = 'gym_id_seq'
          ) AS exists
        `;
        const emailCol = await sql<{ is_nullable: string }[]>`
          SELECT is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'profiles'
            AND column_name = 'email'
        `;
        const has0008 = gymSeq[0].exists;
        const has0007 = emailCol[0]?.is_nullable === "YES";

        // 0000-0006 are considered applied whenever `profiles` exists
        // (this app has been running in prod for months with that baseline).
        const backfill: string[] = [];
        for (const f of files) {
          if (f.startsWith("0007") && !has0007) continue;
          if (f.startsWith("0008") && !has0008) continue;
          backfill.push(f);
        }

        if (backfill.length > 0) {
          console.log(
            `[migrate] Existing DB detected — backfilling ${backfill.length} migration(s) into _app_migrations…`,
          );
          await sql`
            INSERT INTO _app_migrations ${sql(
              backfill.map((filename) => ({ filename })),
            )}
            ON CONFLICT (filename) DO NOTHING
          `;
          console.log(
            `[migrate] Backfilled: ${backfill[0]} … ${backfill[backfill.length - 1]}`,
          );
        }
      }
    }

    // 4. Apply any not-yet-applied files
    const appliedRows = await sql<{ filename: string }[]>`
      SELECT filename FROM _app_migrations
    `;
    const applied = new Set(appliedRows.map((r) => r.filename));

    let appliedCount = 0;
    let skippedCount = 0;

    for (const f of files) {
      if (applied.has(f)) {
        console.log(`✓ ${f} (already applied)`);
        skippedCount++;
        continue;
      }

      const path = join(MIGRATIONS_DIR, f);
      const contents = readFileSync(path, "utf8");
      const statements = contents
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);

      console.log(`→ ${f} (${statements.length} statement(s))…`);
      for (const stmt of statements) {
        try {
          await sql.unsafe(stmt);
        } catch (err) {
          console.error(`\n[migrate] FAILED in ${f}`);
          console.error("[migrate] Statement:\n" + stmt);
          console.error("[migrate] Error:", err);
          process.exit(1);
        }
      }
      await sql`INSERT INTO _app_migrations (filename) VALUES (${f})`;
      console.log(`  ✓ ${f}`);
      appliedCount++;
    }

    const total = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM _app_migrations
    `;
    console.log(
      `\n[migrate] Applied ${appliedCount} new migration(s), ${skippedCount} already up-to-date. Ledger now holds ${total[0].count} row(s).`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("[migrate] Unhandled error:", e);
  process.exit(1);
});
