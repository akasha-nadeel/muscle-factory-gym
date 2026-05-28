/**
 * Backfill / refresh profiles.photo_url from Clerk.
 *
 * Run manually (not in CI):
 *   npx tsx scripts/backfill-clerk-photos.ts           # only NULL rows
 *   npx tsx scripts/backfill-clerk-photos.ts --all     # refresh every row
 *
 * `--all` is useful when:
 *  - The Clerk webhook wasn't configured for production yet, so existing
 *    members' photos never made it into the DB.
 *  - A member updated their Clerk photo and the user.updated webhook
 *    didn't fire (e.g. localhost dev, or webhook misconfigured).
 *
 * For each row we hit clerkClient().users.getUser and persist the imageUrl.
 * A 100ms sleep between calls keeps us under Clerk's ~20 req/s soft limit.
 *
 * Idempotent — safe to re-run any time.
 */
// Loads .env.local + .env into process.env. MUST be the first import — it
// runs as a side-effect before sibling imports below pull in src/db/index.ts,
// which reads DATABASE_URL at module-load time.
import "./_load-env";

import { clerkClient } from "@clerk/nextjs/server";
import { isNull, eq, like, and, not } from "drizzle-orm";
import { db } from "../src/db";
import { profiles } from "../src/db/schema";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const refreshAll = process.argv.includes("--all");

  // Skip wiped profiles (clerk_user_id starts with 'removed:' — Clerk would
  // reject the lookup anyway).
  const where = refreshAll
    ? and(not(like(profiles.clerkUserId, "removed:%")))
    : and(
        isNull(profiles.photoUrl),
        not(like(profiles.clerkUserId, "removed:%")),
      );

  const rows = await db
    .select({ id: profiles.id, clerkUserId: profiles.clerkUserId })
    .from(profiles)
    .where(where);

  console.log(
    refreshAll
      ? `Refreshing photo_url for ${rows.length} profile(s) from Clerk.`
      : `Found ${rows.length} profile(s) missing photo_url.`,
  );
  if (rows.length === 0) return;

  const client = await clerkClient();
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const u = await client.users.getUser(row.clerkUserId);
      const url = u.imageUrl ?? null;
      if (!url) {
        skipped++;
        console.log(`[skip] ${row.clerkUserId} — no imageUrl`);
      } else {
        await db
          .update(profiles)
          .set({ photoUrl: url })
          .where(eq(profiles.id, row.id));
        ok++;
        console.log(`[ok]   ${row.clerkUserId} → ${url}`);
      }
    } catch (err) {
      failed++;
      console.warn(`[fail] ${row.clerkUserId}: ${String(err)}`);
    }
    await sleep(100);
  }

  console.log(`\nDone. updated=${ok} skipped=${skipped} failed=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
