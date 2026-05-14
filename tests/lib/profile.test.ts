import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getProfileByClerkId } from "@/lib/auth";

const TEST_CLERK_ID = "user_profile_test_1";
const TEST_EMAIL = "profile-test@example.com";

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
