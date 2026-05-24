import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/db";
import {
  profiles,
  attendance,
  memberships,
  payments,
  workoutPlans,
} from "@/db/schema";
import { eq } from "drizzle-orm";

// Mock the storage module BEFORE importing the cron module so the cron picks
// up the mocked deleteWorkoutPlan. vi.mock is hoisted to the top of the file.
vi.mock("@/lib/storage/supabase-storage", () => ({
  deleteWorkoutPlan: vi.fn().mockRejectedValue(new Error("boom")),
  uploadWorkoutPlan: vi.fn(),
  signedWorkoutPlanUrl: vi.fn(),
}));

import { _wipeStaleMembersUnsafe } from "@/lib/cron/wipe";

const CLERK_PREFIX = "user_phase5_test_wipestorage_";

const insertedProfileIds = new Set<string>();

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
}

beforeEach(clean);
afterEach(clean);

describe("_wipeStaleMembersUnsafe — storage failure", () => {
  it("deletes workout_plans row even if storage delete fails", async () => {
    const [m] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}plan`,
        email: "wipe-storage@x.lk",
        fullName: "Storage Fail Member",
        role: "member",
        status: "active",
        createdAt: new Date("2025-10-28"), // ~200 days before 2026-05-16
      })
      .returning();
    insertedProfileIds.add(m.id);

    await db.insert(workoutPlans).values({
      memberId: m.id,
      fileName: "plan.pdf",
      storagePath: `${m.id}/fake-${Date.now()}-plan.pdf`,
      fileSizeBytes: 1024,
    });

    const summary = await _wipeStaleMembersUnsafe({ todaySL: "2026-05-16" });
    expect(summary.wiped).toBe(1);
    expect(summary.storageErrors).toBe(1);

    const planRows = await db
      .select()
      .from(workoutPlans)
      .where(eq(workoutPlans.memberId, m.id));
    expect(planRows).toHaveLength(0);

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
});
