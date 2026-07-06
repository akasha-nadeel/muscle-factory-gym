import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships, payments } from "@/db/schema";
import { eq, like, sql } from "drizzle-orm";
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

// Post-Task-7: gym IDs come from a monotonic Postgres sequence. The
// sequence advances independently of MAX(gym_id) — other tests in the
// suite may have called nextval() and pushed it past the current MAX.
// Pin it to MAX (or 999 on empty DB) before each test so assertions of
// the form `baseline + 1` continue to hold.
async function resetSequence() {
  // setval rejects a value below MINVALUE (1000): on an empty table set 1000
  // with is_called=false (next value = 1000), otherwise MAX with is_called=true
  // (next = MAX+1). The old `GREATEST(999, …), true` form errored on a fresh DB.
  await db.execute(sql`
    SELECT setval(
      'gym_id_seq',
      GREATEST(1000, COALESCE((SELECT MAX(gym_id) FROM profiles), 1000)),
      (SELECT EXISTS (SELECT 1 FROM profiles WHERE gym_id IS NOT NULL))
    )
  `);
}

beforeEach(async () => {
  await clean();
  await resetSequence();
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
  it("assigns the next sequential gym_id on approval", async () => {
    const baselineRows = await db
      .select({ m: sql<number | null>`max(${profiles.gymId})` })
      .from(profiles);
    const baseline = baselineRows[0]?.m ?? null;

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
    if (baseline === null) {
      expect(reloaded.gymId).toBe(1000);
    } else {
      expect(reloaded.gymId).toBe(baseline + 1);
    }
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
