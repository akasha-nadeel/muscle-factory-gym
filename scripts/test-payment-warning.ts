/**
 * One-off dev script to test the kiosk's PAYMENT DUE warning.
 *
 * What it does:
 *   1. Shifts Gym ID 1002's active membership end_date to today (SL date)
 *   2. Deletes any attendance row for Gym ID 1002 from today's SL window
 *
 * Pass `--restore <YYYY-MM-DD>` to put the end_date back to the original
 * date after testing.
 *
 * Usage:
 *   npx tsx scripts/test-payment-warning.ts                  # set end_date = today
 *   npx tsx scripts/test-payment-warning.ts --restore 2026-08-19
 */

import "./_load-env";
import { db } from "../src/db";
import { profiles, memberships, attendance } from "../src/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { todayInSL } from "../src/lib/tz";

const GYM_ID = 1002;

async function main() {
  const args = process.argv.slice(2);
  const restoreIdx = args.indexOf("--restore");
  const restoreDate = restoreIdx >= 0 ? args[restoreIdx + 1] : null;

  const [member] = await db
    .select({ id: profiles.id, fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.gymId, GYM_ID))
    .limit(1);

  if (!member) {
    console.error(`No member with gym_id=${GYM_ID}`);
    process.exit(1);
  }

  const [activeMem] = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.memberId, member.id), eq(memberships.status, "active")),
    )
    .limit(1);

  if (!activeMem) {
    console.error(`Member ${member.fullName} (#${GYM_ID}) has no active membership`);
    process.exit(1);
  }

  if (restoreDate) {
    console.log(
      `Restoring end_date to ${restoreDate} for ${member.fullName} (#${GYM_ID})…`,
    );
    await db
      .update(memberships)
      .set({ endDate: restoreDate })
      .where(eq(memberships.id, activeMem.id));
    console.log(`OK — end_date is now ${restoreDate}`);
    return;
  }

  const today = todayInSL();
  console.log(`Current end_date for ${member.fullName} (#${GYM_ID}): ${activeMem.endDate}`);
  console.log(`Shifting end_date to today (${today})…`);

  await db
    .update(memberships)
    .set({ endDate: today })
    .where(eq(memberships.id, activeMem.id));

  // Clear today's attendance rows (-6h grace window covers UTC/SL skew)
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const deleted = await db
    .delete(attendance)
    .where(
      and(
        eq(attendance.memberId, member.id),
        gte(attendance.checkedInAt, sql`${sixHoursAgo.toISOString()}::timestamptz`),
      ),
    )
    .returning({ id: attendance.id });

  console.log(`OK — end_date set to ${today}; cleared ${deleted.length} recent attendance row(s).`);
  console.log("");
  console.log(`Now visit http://localhost:3001/checkin and submit Gym ID ${GYM_ID}.`);
  console.log(`When done, restore the original end_date:`);
  console.log(`  npx tsx scripts/test-payment-warning.ts --restore ${activeMem.endDate}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
