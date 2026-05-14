import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getProfileByClerkId, _syncProfileFromClerkUnsafe } from "@/lib/auth";

const TEST_CLERK_ID = "user_profile_test_1";
const TEST_EMAIL = "profile-test@example.com";
const SYNC_CLERK_ID = "user_sync_test_1";

describe("getProfileByClerkId", () => {
  beforeEach(async () => {
    await db.delete(profiles).where(eq(profiles.clerkUserId, TEST_CLERK_ID));
  });
  afterEach(async () => {
    await db.delete(profiles).where(eq(profiles.clerkUserId, TEST_CLERK_ID));
  });

  it("returns null when no profile exists for the clerk id", async () => {
    const row = await getProfileByClerkId(TEST_CLERK_ID);
    expect(row).toBeNull();
  });

  it("returns the profile row when one exists", async () => {
    await db.insert(profiles).values({
      clerkUserId: TEST_CLERK_ID,
      email: TEST_EMAIL,
      fullName: "Profile Test",
      role: "member",
      status: "pending",
    });
    const row = await getProfileByClerkId(TEST_CLERK_ID);
    expect(row).not.toBeNull();
    expect(row!.email).toBe(TEST_EMAIL);
    expect(row!.role).toBe("member");
    expect(row!.status).toBe("pending");
  });
});

describe("_syncProfileFromClerkUnsafe", () => {
  beforeEach(async () => {
    await db.delete(profiles).where(eq(profiles.clerkUserId, SYNC_CLERK_ID));
  });
  afterEach(async () => {
    await db.delete(profiles).where(eq(profiles.clerkUserId, SYNC_CLERK_ID));
  });

  it("creates a profile when none exists (member / pending defaults)", async () => {
    const profile = await _syncProfileFromClerkUnsafe(
      SYNC_CLERK_ID,
      { primaryEmail: "sync-new@example.com", firstName: "Sync", lastName: "New" },
      "owner@gym.lk",
    );
    expect(profile.clerkUserId).toBe(SYNC_CLERK_ID);
    expect(profile.email).toBe("sync-new@example.com");
    expect(profile.fullName).toBe("Sync New");
    expect(profile.role).toBe("member");
    expect(profile.status).toBe("pending");
  });

  it("promotes to admin / active when email matches ADMIN_EMAILS", async () => {
    const profile = await _syncProfileFromClerkUnsafe(
      SYNC_CLERK_ID,
      { primaryEmail: "owner@gym.lk", firstName: "The", lastName: "Owner" },
      "owner@gym.lk",
    );
    expect(profile.role).toBe("admin");
    expect(profile.status).toBe("active");
  });

  it("preserves existing role/status on idempotent re-sync", async () => {
    // Pre-existing active member.
    await db.insert(profiles).values({
      clerkUserId: SYNC_CLERK_ID,
      email: "existing@example.com",
      fullName: "Existing User",
      role: "member",
      status: "active",
    });
    const profile = await _syncProfileFromClerkUnsafe(
      SYNC_CLERK_ID,
      { primaryEmail: "existing@example.com", firstName: "Existing", lastName: "User" },
      undefined,
    );
    // upsertProfileFromClerk uses onConflictDoUpdate that only touches email/fullName/updatedAt — role/status preserved.
    expect(profile.status).toBe("active");
    expect(profile.role).toBe("member");
  });
});
