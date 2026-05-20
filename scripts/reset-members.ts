/**
 * One-off: wipe ALL member profile rows + their related attendance,
 * payments, and memberships. Admins (role='admin') are kept.
 *
 *   npx tsx scripts/reset-members.ts
 *
 * Use after deleting users from Clerk dashboard, to bring the DB back
 * in sync. Idempotent — running again on an already-clean DB is a no-op.
 *
 * The deletes run in a single transaction. If anything fails, nothing
 * is committed.
 */
import "./_load-env";

import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import {
  profiles,
  memberships,
  payments,
  attendance,
} from "../src/db/schema";

async function main() {
  // Find member profile ids first so the cascade-by-id deletes are precise.
  const memberRows = await db
    .select({ id: profiles.id, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.role, "member"));

  if (memberRows.length === 0) {
    console.log("No member profiles found. DB is clean.");
    return;
  }

  console.log(`Found ${memberRows.length} member profile(s):`);
  for (const m of memberRows) {
    console.log(`  - ${m.email}`);
  }
  console.log("");

  const memberIds = memberRows.map((r) => r.id);

  await db.transaction(async (tx) => {
    // Order matters — ON DELETE restrict on these FKs means we must
    // delete children before the parent profile row.
    const att = await tx
      .delete(attendance)
      .where(inArray(attendance.memberId, memberIds))
      .returning({ id: attendance.id });
    console.log(`[deleted] attendance rows: ${att.length}`);

    const pay = await tx
      .delete(payments)
      .where(inArray(payments.memberId, memberIds))
      .returning({ id: payments.id });
    console.log(`[deleted] payments rows: ${pay.length}`);

    const mem = await tx
      .delete(memberships)
      .where(inArray(memberships.memberId, memberIds))
      .returning({ id: memberships.id });
    console.log(`[deleted] memberships rows: ${mem.length}`);

    const prof = await tx
      .delete(profiles)
      .where(inArray(profiles.id, memberIds))
      .returning({ id: profiles.id, email: profiles.email });
    console.log(`[deleted] profiles rows: ${prof.length}`);
  });

  console.log("\nDone. Admins preserved.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
