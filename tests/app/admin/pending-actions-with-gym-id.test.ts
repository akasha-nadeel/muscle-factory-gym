import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships, payments } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { _approveMemberUnsafe } from "@/app/admin/pending/actions";

const CLERK_PREFIX = "user_phase3_approve_gymid_";
const PLAN_NAME = "Phase3ApproveGymIdPlan";

let planId: string;
let adminId: string;

async function clean() {
  const ms = await db
    .select()
    .from(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  for (const m of ms) {
    await db.delete(payments).where(eq(payments.memberId, m.id));
    await db.delete(memberships).where(eq(memberships.memberId, m.id));
  }
  await db.delete(plans).where(eq(plans.name, PLAN_NAME));
  await db
    .delete(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
}

beforeEach(async () => {
  await clean();
  const [pl] = await db
    .insert(plans)
    .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "5000" })
    .returning();
  planId = pl.id;
  const [a] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}admin`,
      email: "agi-a@x.lk",
      fullName: "Approve GymId Admin",
      role: "admin",
      status: "active",
    })
    .returning();
  adminId = a.id;
});

afterEach(clean);

async function insertPending(suffix: string) {
  const [m] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}${suffix}`,
      email: `${suffix}@x.lk`,
      fullName: `Pending ${suffix}`,
      role: "member",
      status: "pending",
    })
    .returning();
  return m;
}

describe("_approveMemberUnsafe assigns gym_id", () => {
  it("assigns gym_id starting at 1000 on the first approval", async () => {
    const member = await insertPending("first");
    const r = await _approveMemberUnsafe({
      memberId: member.id,
      planId,
      approvedByProfileId: adminId,
      today: "2026-05-15",
    });
    expect(r.ok).toBe(true);
    const [reloaded] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, member.id));
    expect(reloaded.gymId).toBe(1000);
  });

  it("assigns consecutive gym_ids across multiple approvals", async () => {
    const m1 = await insertPending("seq1");
    const m2 = await insertPending("seq2");
    await _approveMemberUnsafe({
      memberId: m1.id,
      planId,
      approvedByProfileId: adminId,
      today: "2026-05-15",
    });
    await _approveMemberUnsafe({
      memberId: m2.id,
      planId,
      approvedByProfileId: adminId,
      today: "2026-05-15",
    });
    const [r1] = await db.select().from(profiles).where(eq(profiles.id, m1.id));
    const [r2] = await db.select().from(profiles).where(eq(profiles.id, m2.id));
    expect(r2.gymId).toBe((r1.gymId ?? 0) + 1);
  });

  it("does not overwrite an existing gym_id on re-approval of an active member", async () => {
    const member = await insertPending("reapprove");
    await _approveMemberUnsafe({
      memberId: member.id,
      planId,
      approvedByProfileId: adminId,
      today: "2026-05-15",
    });
    const [firstPass] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, member.id));
    const firstGymId = firstPass.gymId;

    // Try to approve again — should be a no-op (already active)
    const r = await _approveMemberUnsafe({
      memberId: member.id,
      planId,
      approvedByProfileId: adminId,
      today: "2026-05-15",
    });
    expect(r.ok).toBe(false);

    const [secondPass] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, member.id));
    expect(secondPass.gymId).toBe(firstGymId);
  });
});
