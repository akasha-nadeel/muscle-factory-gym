/**
 * One-off integrity probe — sanity-checks the DB rows the test plan
 * references. Pure read-only, doesn't mutate anything.
 */

import "./_load-env";
import { db } from "../src/db";
import {
  profiles,
  memberships,
  payments,
  attendance,
  plans,
  workoutPlans,
} from "../src/db/schema";
import { eq, and, count, sql, desc } from "drizzle-orm";

async function main() {
  console.log("\n=== PROFILE COUNTS ===");
  const byStatus = await db
    .select({ status: profiles.status, n: count() })
    .from(profiles)
    .groupBy(profiles.status);
  for (const r of byStatus) console.log(`  ${r.status}: ${r.n}`);

  const byRole = await db
    .select({ role: profiles.role, n: count() })
    .from(profiles)
    .groupBy(profiles.role);
  console.log("");
  for (const r of byRole) console.log(`  role=${r.role}: ${r.n}`);

  console.log("\n=== GYM ID ASSIGNMENT ===");
  const [{ maxGymId }] = await db
    .select({ maxGymId: sql<number>`MAX(gym_id)` })
    .from(profiles);
  console.log(`  highest gym_id: ${maxGymId ?? "(none assigned)"}`);

  console.log("\n=== ACTIVE MEMBERS WITH OUTSTANDING ===");
  const activeMembers = await db
    .select({
      id: profiles.id,
      gymId: profiles.gymId,
      fullName: profiles.fullName,
    })
    .from(profiles)
    .where(and(eq(profiles.status, "active"), eq(profiles.role, "member")));
  for (const m of activeMembers) {
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
        and(eq(memberships.memberId, m.id), eq(memberships.status, "active")),
      )
      .limit(1);
    if (!activeMem) {
      console.log(`  #${m.gymId} ${m.fullName} — no active membership`);
      continue;
    }
    const paid = await db
      .select({
        amountLkr: payments.amountLkr,
        status: payments.status,
        kind: payments.kind,
      })
      .from(payments)
      .where(
        and(
          eq(payments.memberId, m.id),
          eq(payments.membershipId, activeMem.id),
        ),
      );
    const paidLkr = paid
      .filter((p) => p.kind === "membership")
      .filter((p) => p.status === "succeeded" || p.status === "refunded")
      .reduce((s, p) => s + Number(p.amountLkr), 0);
    const outstanding = Math.max(0, Number(activeMem.planPriceLkr) - paidLkr);
    console.log(
      `  #${m.gymId} ${m.fullName.padEnd(30)} | plan=${activeMem.planName.padEnd(10)} end=${activeMem.endDate} | paid=${paidLkr} | outstanding=${outstanding}`,
    );
  }

  console.log("\n=== ATTENDANCE (last 5) ===");
  const recent = await db
    .select({
      checkedInAt: attendance.checkedInAt,
      source: attendance.source,
      gymId: profiles.gymId,
      fullName: profiles.fullName,
    })
    .from(attendance)
    .innerJoin(profiles, eq(profiles.id, attendance.memberId))
    .orderBy(desc(attendance.checkedInAt))
    .limit(5);
  for (const r of recent) {
    console.log(
      `  ${r.checkedInAt.toISOString()} | #${r.gymId} ${r.fullName} | source=${r.source}`,
    );
  }

  console.log("\n=== WORKOUT PLANS ===");
  const wps = await db
    .select({
      fileName: workoutPlans.fileName,
      sizeBytes: workoutPlans.fileSizeBytes,
      createdAt: workoutPlans.createdAt,
      fullName: profiles.fullName,
      gymId: profiles.gymId,
    })
    .from(workoutPlans)
    .innerJoin(profiles, eq(profiles.id, workoutPlans.memberId));
  if (wps.length === 0) console.log("  (none)");
  for (const wp of wps) {
    console.log(
      `  #${wp.gymId} ${wp.fullName} | ${wp.fileName} (${wp.sizeBytes} bytes) | ${wp.createdAt.toISOString()}`,
    );
  }

  console.log("\n=== PAYMENTS SUMMARY ===");
  const allPay = await db
    .select({
      status: payments.status,
      n: count(),
    })
    .from(payments)
    .groupBy(payments.status);
  for (const r of allPay) console.log(`  ${r.status}: ${r.n}`);

  console.log("\n=== PLANS ===");
  const allPlans = await db.select().from(plans);
  for (const p of allPlans) {
    console.log(
      `  ${p.name.padEnd(15)} | ${p.durationDays}d | LKR ${p.priceLkr} | active=${p.isActive}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
