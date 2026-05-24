import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import {
  profiles,
  attendance,
  memberships,
  payments,
  workoutPlans,
} from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { _wipeStaleMembersUnsafe } from "@/lib/cron/wipe";
import { _assignNextGymIdUnsafe } from "@/lib/gym-id";
import { upsertProfileFromClerk } from "@/app/api/clerk/webhook/upsert";

const CLERK_PREFIX = "user_phase5_test_resignup_";
const ALICE_CLERK_ID = `${CLERK_PREFIX}alice`;
const ALICE_EMAIL = "resignup-test@x.lk";

// Track inserted IDs at module scope so clean() can reach rows whose
// clerkUserId has been rewritten to `removed:<uuid>` by a previous wipe,
// AND so it can find the brand-new row the webhook inserts.
const insertedProfileIds = new Set<string>();

async function clean() {
  // Catch any stragglers from previous aborted runs by clerkUserId match
  // before we forget about them: query for any live OR tombstoned rows
  // that match our prefix or the alice email.
  const liveRows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.clerkUserId, ALICE_CLERK_ID));
  for (const r of liveRows) insertedProfileIds.add(r.id);

  const emailRows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, ALICE_EMAIL));
  for (const r of emailRows) insertedProfileIds.add(r.id);

  const tombstoneRows = await db
    .select({ id: profiles.id, clerkUserId: profiles.clerkUserId })
    .from(profiles)
    .where(like(profiles.clerkUserId, "removed:%"));
  for (const r of tombstoneRows) {
    // Only sweep tombstones whose underlying id we already tracked.
    if (insertedProfileIds.has(r.id)) continue;
    // If the tombstone's id matches any tracked profile, include it.
    // Otherwise leave alone — other tests' tombstones aren't ours.
  }

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

describe("Clerk re-signup after wipe (integration)", () => {
  it("creates a fresh profile row, leaves the tombstone untouched, and assigns a fresh gym ID on approval", async () => {
    // ---------------------------------------------------------------------
    // Step 1: Seed a "former member" profile directly. Old createdAt so the
    // wipe staleness predicate fires (no attendance row needed).
    // ---------------------------------------------------------------------
    const originalGymId = 1500;
    const [originalRow] = await db
      .insert(profiles)
      .values({
        clerkUserId: ALICE_CLERK_ID,
        email: ALICE_EMAIL,
        fullName: "Original Name",
        role: "member",
        status: "active",
        createdAt: new Date("2025-10-28"), // ~200 days before 2026-05-16
        gymId: originalGymId,
      })
      .returning();
    insertedProfileIds.add(originalRow.id);
    const originalId = originalRow.id;

    // ---------------------------------------------------------------------
    // Step 2: Wipe. Verify the tombstone shape.
    // ---------------------------------------------------------------------
    await _wipeStaleMembersUnsafe({ todaySL: "2026-05-16" });

    const [tombstone] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, originalId));
    expect(tombstone).toBeDefined();
    expect(tombstone.clerkUserId).toBe(`removed:${originalId}`);
    expect(tombstone.email).toBeNull();
    expect(tombstone.gymId).toBeNull();
    expect(tombstone.fullName).toBe("Former member");
    expect(tombstone.status).toBe("inactive");

    // ---------------------------------------------------------------------
    // Step 3: The same person signs back in via Clerk. Webhook calls upsert
    // with the SAME live Clerk ID and email as before.
    // ---------------------------------------------------------------------
    await upsertProfileFromClerk({
      clerkUserId: ALICE_CLERK_ID,
      email: ALICE_EMAIL,
      fullName: "Returning Alice",
      photoUrl: null,
      adminEmailsCsv: undefined,
    });

    // ---------------------------------------------------------------------
    // Step 4: Verify two profile rows exist for this person — the tombstone
    // (untouched) and a brand-new INSERTed row.
    // ---------------------------------------------------------------------
    const [tombstoneAfter] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, originalId));
    expect(tombstoneAfter).toBeDefined();
    expect(tombstoneAfter.clerkUserId).toBe(`removed:${originalId}`);
    expect(tombstoneAfter.email).toBeNull();
    expect(tombstoneAfter.fullName).toBe("Former member");
    expect(tombstoneAfter.status).toBe("inactive");

    const freshRows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.clerkUserId, ALICE_CLERK_ID));
    expect(freshRows).toHaveLength(1);
    const fresh = freshRows[0];
    insertedProfileIds.add(fresh.id); // track for cleanup

    expect(fresh.id).not.toBe(originalId);
    expect(fresh.email).toBe(ALICE_EMAIL);
    expect(fresh.fullName).toBe("Returning Alice");
    expect(fresh.role).toBe("member");
    expect(fresh.status).toBe("pending");
    expect(fresh.gymId).toBeNull();

    // ---------------------------------------------------------------------
    // Step 5: Admin "approval" simulates by directly calling the gym-ID
    // assigner. The returned ID must be a valid integer in [1000, 9999]
    // that isn't held by any currently-active profile.
    // ---------------------------------------------------------------------
    const nextGymId = await _assignNextGymIdUnsafe(db);
    expect(Number.isInteger(nextGymId)).toBe(true);
    expect(nextGymId).toBeGreaterThanOrEqual(1000);
    expect(nextGymId).toBeLessThanOrEqual(9999);

    const collision = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.gymId, nextGymId));
    expect(collision).toHaveLength(0);
  });
});
