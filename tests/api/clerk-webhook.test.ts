import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { upsertProfileFromClerk } from "@/app/api/clerk/webhook/upsert";

const TEST_CLERK_ID = "user_test_abc";
const TEST_EMAIL = "wh-test@example.com";

describe("upsertProfileFromClerk", () => {
  beforeEach(async () => {
    await db.delete(profiles).where(eq(profiles.clerkUserId, TEST_CLERK_ID));
  });

  it("inserts a new profile with member/pending when not an admin email", async () => {
    await upsertProfileFromClerk({
      clerkUserId: TEST_CLERK_ID,
      email: TEST_EMAIL,
      fullName: "Test User",
      adminEmailsCsv: "owner@gym.lk",
    });
    const [row] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.clerkUserId, TEST_CLERK_ID));
    expect(row.role).toBe("member");
    expect(row.status).toBe("pending");
    expect(row.email).toBe(TEST_EMAIL);
  });

  it("is idempotent (calling twice yields one row, same state)", async () => {
    const payload = {
      clerkUserId: TEST_CLERK_ID,
      email: TEST_EMAIL,
      fullName: "Test User",
      adminEmailsCsv: "owner@gym.lk",
    };
    await upsertProfileFromClerk(payload);
    await upsertProfileFromClerk(payload);
    const rows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.clerkUserId, TEST_CLERK_ID));
    expect(rows.length).toBe(1);
  });

  it("promotes to admin/active when email is in admin list", async () => {
    await upsertProfileFromClerk({
      clerkUserId: TEST_CLERK_ID,
      email: TEST_EMAIL,
      fullName: "Test User",
      adminEmailsCsv: TEST_EMAIL,
    });
    const [row] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.clerkUserId, TEST_CLERK_ID));
    expect(row.role).toBe("admin");
    expect(row.status).toBe("active");
  });
});
