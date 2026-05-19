/**
 * One-time backfill of profiles.photo_url from Clerk.
 *
 * Run manually (not in CI):
 *   npx tsx scripts/backfill-clerk-photos.ts
 *
 * For each profile where photo_url IS NULL we hit clerkClient().users.getUser
 * and persist the imageUrl. A 100ms sleep between calls keeps us under
 * Clerk's ~20 req/s soft limit.
 *
 * Idempotent — re-running only touches rows still missing photoUrl.
 */
// Loads .env.local + .env into process.env. MUST be the first import — it
// runs as a side-effect before sibling imports below pull in src/db/index.ts,
// which reads DATABASE_URL at module-load time.
import "./_load-env";

import { clerkClient } from "@clerk/nextjs/server";
import { isNull, eq } from "drizzle-orm";
import { db } from "../src/db";
import { profiles } from "../src/db/schema";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const rows = await db
    .select({ id: profiles.id, clerkUserId: profiles.clerkUserId })
    .from(profiles)
    .where(isNull(profiles.photoUrl));

  console.log(`Found ${rows.length} profile(s) missing photo_url.`);
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
