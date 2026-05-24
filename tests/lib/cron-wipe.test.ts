import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import {
  profiles,
  attendance,
  memberships,
  payments,
  workoutPlans,
  plans,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { _wipeStaleMembersUnsafe } from "@/lib/cron/wipe";
import { _assignNextGymIdUnsafe } from "@/lib/gym-id";

const CLERK_PREFIX = "user_phase5_test_wipe_";
const PLAN_NAME = "Phase5WipePlan";

// Track inserted IDs at module scope so clean() can reach rows whose
// clerkUserId has been rewritten to `removed:<uuid>` by a previous wipe.
const insertedProfileIds = new Set<string>();
const insertedPlanIds = new Set<string>();

async function clean() {
  const ids = [...insertedProfileIds];
  for (const id of ids) {
    await db.delete(workoutPlans).where(eq(workoutPlans.memberId, id));
    await db.delete(payments).where(eq(payments.memberId, id));
    await db.delete(memberships).where(eq(memberships.memberId, id));
    await db.delete(attendance).where(eq(attendance.memberId, id));
    await db.delete(profiles).where(eq(profiles.id, id));
  }
  insertedProfileIds.clear();
  for (const id of [...insertedPlanIds]) {
    await db.delete(plans).where(eq(plans.id, id));
  }
  insertedPlanIds.clear();
}

beforeEach(clean);
afterEach(clean);

async function insertProfile(opts: {
  suffix: string;
  role: "member" | "admin";
  status: "active" | "pending" | "inactive";
  createdAt: Date;
  gymId?: number;
}) {
  const [row] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}${opts.suffix}`,
      email: `${opts.suffix}@x.lk`,
      fullName: `Wipe ${opts.suffix}`,
      role: opts.role,
      status: opts.status,
      createdAt: opts.createdAt,
      gymId: opts.gymId,
    })
    .returning();
  insertedProfileIds.add(row.id);
  return row;
}

async function insertCheckin(memberId: string, when: Date) {
  await db.insert(attendance).values({
    memberId,
    checkedInAt: when,
    source: "kiosk_id",
  });
}

async function insertPlan() {
  const [row] = await db
    .insert(plans)
    .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "1500" })
    .returning();
  insertedPlanIds.add(row.id);
  return row;
}

describe("_wipeStaleMembersUnsafe", () => {
  it("wipes a member with last check-in 200 days ago", async () => {
    const m = await insertProfile({
      suffix: "lapsed",
      role: "member",
      status: "active",
      createdAt: new Date("2025-05-01"),
    });
    await insertCheckin(m.id, new Date("2025-10-28")); // ~200 days before 2026-05-16
    await _wipeStaleMembersUnsafe({ todaySL: "2026-05-16" });
    const [after] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, m.id));
    expect(after.status).toBe("inactive");
    expect(after.email).toBeNull();
    expect(after.phone).toBeNull();
    expect(after.photoUrl).toBeNull();
    expect(after.gymId).toBeNull();
    expect(after.fullName).toBe("Former member");
    expect(after.clerkUserId).toBe(`removed:${after.id}`);
  });

  it("leaves a member with a recent check-in active", async () => {
    const m = await insertProfile({
      suffix: "recent",
      role: "member",
      status: "active",
      createdAt: new Date("2025-05-01"),
    });
    await insertCheckin(m.id, new Date("2026-04-30")); // 16 days before today
    await _wipeStaleMembersUnsafe({ todaySL: "2026-05-16" });
    const [after] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, m.id));
    expect(after.status).toBe("active");
    expect(after.clerkUserId).not.toMatch(/^removed:/);
  });

  it("leaves a never-checked-in member with a recent created_at active", async () => {
    const m = await insertProfile({
      suffix: "newbie",
      role: "member",
      status: "active",
      createdAt: new Date("2026-05-01"), // 15 days before today
    });
    await _wipeStaleMembersUnsafe({ todaySL: "2026-05-16" });
    const [after] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, m.id));
    expect(after.status).toBe("active");
    expect(after.clerkUserId).not.toMatch(/^removed:/);
  });

  it("wipes a never-checked-in member whose created_at is 200 days ago", async () => {
    const m = await insertProfile({
      suffix: "ghost",
      role: "member",
      status: "active",
      createdAt: new Date("2025-10-28"), // ~200 days before today
    });
    await _wipeStaleMembersUnsafe({ todaySL: "2026-05-16" });
    const [after] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, m.id));
    expect(after.status).toBe("inactive");
    expect(after.email).toBeNull();
    expect(after.phone).toBeNull();
    expect(after.photoUrl).toBeNull();
    expect(after.gymId).toBeNull();
    expect(after.fullName).toBe("Former member");
    expect(after.clerkUserId).toBe(`removed:${after.id}`);
  });

  it("never wipes an admin profile, even if last check-in is >180 days ago", async () => {
    const a = await insertProfile({
      suffix: "admin",
      role: "admin",
      status: "active",
      createdAt: new Date("2025-01-01"), // very old
    });
    await _wipeStaleMembersUnsafe({ todaySL: "2026-05-16" });
    const [after] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, a.id));
    expect(after.status).toBe("active");
    expect(after.clerkUserId).not.toMatch(/^removed:/);
  });

  it("preserves payments and memberships when wiping", async () => {
    const m = await insertProfile({
      suffix: "history",
      role: "member",
      status: "active",
      createdAt: new Date("2025-10-28"), // ~200 days before today
    });
    const plan = await insertPlan();
    const [ms] = await db
      .insert(memberships)
      .values({
        memberId: m.id,
        planId: plan.id,
        startDate: "2025-10-28",
        endDate: "2025-11-27",
        status: "active",
      })
      .returning();
    const [pay] = await db
      .insert(payments)
      .values({
        memberId: m.id,
        membershipId: ms.id,
        planId: plan.id,
        amountLkr: "1500",
        method: "cash",
        kind: "membership",
        status: "succeeded",
        reference: `phase5-wipe-test-${m.id}`,
      })
      .returning();

    await _wipeStaleMembersUnsafe({ todaySL: "2026-05-16" });

    const [after] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, m.id));
    expect(after.status).toBe("inactive");
    expect(after.email).toBeNull();
    expect(after.fullName).toBe("Former member");
    expect(after.clerkUserId).toBe(`removed:${after.id}`);

    const msAfter = await db
      .select()
      .from(memberships)
      .where(eq(memberships.memberId, m.id));
    expect(msAfter).toHaveLength(1);
    expect(msAfter[0].id).toBe(ms.id);
    expect(msAfter[0].status).toBe("cancelled");

    const payAfter = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, m.id));
    expect(payAfter).toHaveLength(1);
    expect(payAfter[0].id).toBe(pay.id);
    expect(payAfter[0].amountLkr).toBe("1500.00");
    expect(payAfter[0].status).toBe("succeeded");
  });

  it("is idempotent — second run does not re-wipe an already-wiped profile", async () => {
    const m = await insertProfile({
      suffix: "idem",
      role: "member",
      status: "active",
      createdAt: new Date("2025-10-28"),
    });
    const first = await _wipeStaleMembersUnsafe({ todaySL: "2026-05-16" });
    expect(first.wiped).toBeGreaterThanOrEqual(1);

    const second = await _wipeStaleMembersUnsafe({ todaySL: "2026-05-16" });
    expect(second.wiped).toBe(0);
    expect(second.storageErrors).toBe(0);

    // Profile remains in the wiped shape.
    const [after] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, m.id));
    expect(after.clerkUserId).toBe(`removed:${after.id}`);
  });

  it("wiping a member does not free their gym_id for reuse — next signup gets a higher number", async () => {
    // Post-Task-7: gym IDs come from a monotonic Postgres sequence
    // (`gym_id_seq`), so wiping a member (gym_id -> NULL) does NOT make the
    // freed value available to the next signup. Draw the test member's
    // gymId via the sequence itself — that mirrors the production approve
    // flow and keeps the sequence's internal state in sync with what's
    // actually on the row.
    const originalGymId = await _assignNextGymIdUnsafe(db);
    const m = await insertProfile({
      suffix: "gymid",
      role: "member",
      status: "active",
      createdAt: new Date("2025-10-28"),
      gymId: originalGymId,
    });

    await _wipeStaleMembersUnsafe({ todaySL: "2026-05-16" });

    const [after] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, m.id));
    // The wiped profile's gymId column is cleared on the row...
    expect(after.gymId).toBeNull();

    // ...but the sequence has moved on and will NOT hand the old value back.
    const next = await _assignNextGymIdUnsafe(db);
    expect(next).toBeGreaterThan(originalGymId);
  });

  it("two wipes in a row don't decrement the sequence", async () => {
    const aGymId = await _assignNextGymIdUnsafe(db);
    const a = await insertProfile({
      suffix: "seqA",
      role: "member",
      status: "active",
      createdAt: new Date("2025-10-28"),
      gymId: aGymId,
    });

    const bGymId = await _assignNextGymIdUnsafe(db);
    const b = await insertProfile({
      suffix: "seqB",
      role: "member",
      status: "active",
      createdAt: new Date("2025-10-28"),
      gymId: bGymId,
    });

    await _wipeStaleMembersUnsafe({ todaySL: "2026-05-16" });

    // Both should now be wiped (gymId cleared).
    const [aAfter] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, a.id));
    const [bAfter] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, b.id));
    expect(aAfter.gymId).toBeNull();
    expect(bAfter.gymId).toBeNull();

    const cGymId = await _assignNextGymIdUnsafe(db);
    expect(bGymId).toBeGreaterThan(aGymId);
    expect(cGymId).toBeGreaterThan(bGymId);
  });
});
