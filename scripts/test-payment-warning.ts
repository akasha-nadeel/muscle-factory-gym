/**
 * Dev script to exercise the kiosk's PAYMENT DUE warning.
 *
 * What it does (for a given gym_id):
 *   1. Records the original end_date (so you can restore later)
 *   2. Shifts the active membership end_date to today (SL date)
 *   3. If outstanding is 0, inserts a refund row tagged
 *      `[TEST-WARNING]` so net-paid drops below plan price
 *      → creates outstanding
 *   4. Deletes today's attendance row so the kiosk doesn't reject
 *      the next check-in as "already checked in"
 *
 * Restore mode reverses ONLY the things this script touched:
 *   - Sets end_date back to the date you pass via --restore
 *   - Removes any rows tagged `[TEST-WARNING]` it inserted
 *
 * Usage:
 *   npx tsx scripts/test-payment-warning.ts --gym-id 1004
 *   npx tsx scripts/test-payment-warning.ts --gym-id 1004 --restore 2026-06-20
 */

import "./_load-env";
import { db } from "../src/db";
import { profiles, memberships, attendance, payments, plans } from "../src/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { todayInSL } from "../src/lib/tz";
import { computeOutstanding } from "../src/lib/payments/outstanding";

const TEST_TAG = "[TEST-WARNING]";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main() {
  const gymIdRaw = arg("--gym-id");
  if (!gymIdRaw) {
    console.error("Usage: npx tsx scripts/test-payment-warning.ts --gym-id <N> [--restore <YYYY-MM-DD>]");
    process.exit(1);
  }
  const gymId = Number(gymIdRaw);
  const restoreDate = arg("--restore");

  const [member] = await db
    .select({ id: profiles.id, fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.gymId, gymId))
    .limit(1);
  if (!member) {
    console.error(`No member with gym_id=${gymId}`);
    process.exit(1);
  }

  const [activeMem] = await db
    .select({
      id: memberships.id,
      endDate: memberships.endDate,
      planPriceLkr: plans.priceLkr,
      planName: plans.name,
    })
    .from(memberships)
    .innerJoin(plans, eq(plans.id, memberships.planId))
    .where(
      and(eq(memberships.memberId, member.id), eq(memberships.status, "active")),
    )
    .limit(1);
  if (!activeMem) {
    console.error(`${member.fullName} (#${gymId}) has no active membership`);
    process.exit(1);
  }

  if (restoreDate) {
    console.log(`Restoring ${member.fullName} (#${gymId}):`);
    console.log(`  end_date -> ${restoreDate}`);
    await db
      .update(memberships)
      .set({ endDate: restoreDate })
      .where(eq(memberships.id, activeMem.id));

    const deleted = await db
      .delete(payments)
      .where(
        and(
          eq(payments.memberId, member.id),
          eq(payments.notes, TEST_TAG),
        ),
      )
      .returning({ id: payments.id });
    console.log(`  removed ${deleted.length} test refund row(s)`);
    console.log("Done.");
    return;
  }

  const today = todayInSL();
  console.log(`Setting up warning test for ${member.fullName} (#${gymId})`);
  console.log(`  original end_date: ${activeMem.endDate}`);
  console.log(`  shifting end_date -> ${today}`);

  await db
    .update(memberships)
    .set({ endDate: today })
    .where(eq(memberships.id, activeMem.id));

  // Compute current outstanding; if zero, inject a refund to create one
  const payRows = await db
    .select()
    .from(payments)
    .where(eq(payments.memberId, member.id));
  const outstanding = Number(
    computeOutstanding({
      planPriceLkr: activeMem.planPriceLkr,
      payments: payRows.map((p) => ({
        id: p.id,
        amountLkr: p.amountLkr,
        kind: p.kind,
        status: p.status,
        membershipId: p.membershipId,
      })),
      membershipId: activeMem.id,
    }),
  );
  console.log(`  current outstanding: ${outstanding}`);

  if (outstanding === 0) {
    // Membership-paid amount currently >= plan price. To create dues we
    // insert a tagged refund row of (planPrice / 2) so outstanding = ~half.
    const refundAmount = -Math.floor(Number(activeMem.planPriceLkr) / 2);
    console.log(`  injecting refund of LKR ${refundAmount} (tagged "${TEST_TAG}")`);
    await db.insert(payments).values({
      memberId: member.id,
      membershipId: activeMem.id,
      planId: null,
      amountLkr: String(refundAmount),
      method: "cash",
      kind: "membership",
      status: "refunded",
      reference: `${TEST_TAG}-${Date.now()}`,
      notes: TEST_TAG,
      recordedBy: null,
    });
  }

  // Clear today's attendance
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const cleared = await db
    .delete(attendance)
    .where(
      and(
        eq(attendance.memberId, member.id),
        gte(
          attendance.checkedInAt,
          sql`${sixHoursAgo.toISOString()}::timestamptz`,
        ),
      ),
    )
    .returning({ id: attendance.id });

  console.log(`  cleared ${cleared.length} recent attendance row(s)`);
  console.log("");
  console.log(`Ready. Visit http://localhost:3001/checkin and submit Gym ID ${gymId}.`);
  console.log(`After testing, restore with:`);
  console.log(`  npx tsx scripts/test-payment-warning.ts --gym-id ${gymId} --restore ${activeMem.endDate}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
