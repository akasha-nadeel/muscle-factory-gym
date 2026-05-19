/**
 * One-off cleanup: deletes orphan test-fixture rows that leaked into the
 * shared DB from earlier test runs.
 *
 * Run once:
 *   npx tsx scripts/delete-test-fixtures.ts
 *
 * Idempotent — safe to re-run anytime; no-ops if the rows are already gone.
 */
import "./_load-env";

import { inArray } from "drizzle-orm";
import { db } from "../src/db";
import { profiles } from "../src/db/schema";

// Clerk user IDs that ONLY exist as test fixtures. Add to this list if more
// tests ever leak rows.
const FIXTURE_CLERK_IDS = [
  "user_test_abc", // tests/api/clerk-webhook.test.ts
  "user_profile_action_test", // tests/app/portal/profile-actions.test.ts
];

async function main() {
  const deleted = await db
    .delete(profiles)
    .where(inArray(profiles.clerkUserId, FIXTURE_CLERK_IDS))
    .returning({
      id: profiles.id,
      clerkUserId: profiles.clerkUserId,
      email: profiles.email,
    });
  if (deleted.length === 0) {
    console.log("No fixture rows found. DB is clean.");
    return;
  }
  for (const row of deleted) {
    console.log(`[deleted] ${row.clerkUserId} (${row.email})`);
  }
  console.log(`\nDone. removed=${deleted.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
