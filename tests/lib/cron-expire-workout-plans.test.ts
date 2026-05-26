import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, workoutPlans } from "@/db/schema";

const CLERK_PREFIX = "user_phase17_expire_wp_";

const insertedProfileIds = new Set<string>();

async function clean() {
  for (const id of [...insertedProfileIds]) {
    await db.delete(workoutPlans).where(eq(workoutPlans.memberId, id));
    await db.delete(profiles).where(eq(profiles.id, id));
  }
  insertedProfileIds.clear();
}

beforeEach(clean);
afterEach(clean);

// Stub the Supabase Storage call so the test doesn't need a live bucket.
vi.mock("@/lib/storage/supabase-storage", () => ({
  deleteWorkoutPlan: vi.fn().mockResolvedValue(undefined),
}));

// Import AFTER the mock so the cron picks up the stub.
const { _expireWorkoutPlansUnsafe } = await import(
  "@/lib/cron/expire-workout-plans"
);

async function insertProfileAndPlan(opts: {
  suffix: string;
  planCreatedAt: Date;
}) {
  const [p] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}${opts.suffix}`,
      email: `${opts.suffix}@x.lk`,
      fullName: `Wp ${opts.suffix}`,
      role: "member",
      status: "active",
    })
    .returning();
  insertedProfileIds.add(p.id);
  await db.insert(workoutPlans).values({
    memberId: p.id,
    fileName: `${opts.suffix}.pdf`,
    storagePath: `${p.id}/${opts.suffix}.pdf`,
    fileSizeBytes: 1024,
    createdAt: opts.planCreatedAt,
  });
  return p.id;
}

describe("_expireWorkoutPlansUnsafe", () => {
  it("deletes plans older than 5 days and leaves fresh ones alone", async () => {
    const now = new Date("2026-06-10T00:00:00Z");
    // 6 days old → expired
    const staleId = await insertProfileAndPlan({
      suffix: "stale",
      planCreatedAt: new Date("2026-06-04T00:00:00Z"),
    });
    // 3 days old → still fresh
    const freshId = await insertProfileAndPlan({
      suffix: "fresh",
      planCreatedAt: new Date("2026-06-07T00:00:00Z"),
    });

    const summary = await _expireWorkoutPlansUnsafe({ now });
    expect(summary.deleted).toBe(1);
    expect(summary.storageErrors).toBe(0);

    const staleRows = await db
      .select()
      .from(workoutPlans)
      .where(eq(workoutPlans.memberId, staleId));
    expect(staleRows.length).toBe(0);

    const freshRows = await db
      .select()
      .from(workoutPlans)
      .where(eq(workoutPlans.memberId, freshId));
    expect(freshRows.length).toBe(1);
  });

  it("is idempotent — a second run finds nothing", async () => {
    const now = new Date("2026-06-10T00:00:00Z");
    await insertProfileAndPlan({
      suffix: "idempotent",
      planCreatedAt: new Date("2026-06-04T00:00:00Z"),
    });

    const first = await _expireWorkoutPlansUnsafe({ now });
    expect(first.deleted).toBe(1);

    const second = await _expireWorkoutPlansUnsafe({ now });
    expect(second.deleted).toBe(0);
    expect(second.storageErrors).toBe(0);
  });

  it("treats plan exactly at the 5-day boundary as still fresh", async () => {
    const now = new Date("2026-06-10T00:00:00Z");
    // Exactly 5 days old to the millisecond → cutoff is strict `<`, so fresh.
    await insertProfileAndPlan({
      suffix: "boundary",
      planCreatedAt: new Date("2026-06-05T00:00:00Z"),
    });

    const summary = await _expireWorkoutPlansUnsafe({ now });
    expect(summary.deleted).toBe(0);
  });
});
