import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { _updateMyProfileUnsafe } from "@/app/portal/profile/actions";

const CLERK_ID = "user_profile_action_test";

async function clean() {
  await db.delete(profiles).where(eq(profiles.clerkUserId, CLERK_ID));
}

beforeEach(clean);
afterEach(clean);

describe("_updateMyProfileUnsafe", () => {
  it("updates fullName and phone for the signed-in member", async () => {
    const [me] = await db
      .insert(profiles)
      .values({ clerkUserId: CLERK_ID, email: "x@x.lk", fullName: "Old Name", role: "member", status: "active" })
      .returning();
    const r = await _updateMyProfileUnsafe(me.id, { fullName: "New Name", phone: "0771234567" });
    expect(r.ok).toBe(true);
    const [row] = await db.select().from(profiles).where(eq(profiles.id, me.id));
    expect(row.fullName).toBe("New Name");
    expect(row.phone).toBe("0771234567");
  });

  it("rejects invalid input without writing", async () => {
    const [me] = await db
      .insert(profiles)
      .values({ clerkUserId: CLERK_ID, email: "x@x.lk", fullName: "Old Name", role: "member", status: "active" })
      .returning();
    const r = await _updateMyProfileUnsafe(me.id, { fullName: "", phone: "abc" });
    expect(r.ok).toBe(false);
    const [row] = await db.select().from(profiles).where(eq(profiles.id, me.id));
    expect(row.fullName).toBe("Old Name");
  });
});
