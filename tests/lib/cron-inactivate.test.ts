import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, attendance } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { _inactivateStaleMembersUnsafe } from "@/lib/cron/inactivate";

const CLERK_PREFIX = "user_phase5_test_inactivate_";

async function clean() {
  const rows = await db
    .select()
    .from(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  for (const r of rows) {
    await db.delete(attendance).where(eq(attendance.memberId, r.id));
  }
  await db
    .delete(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
}

beforeEach(clean);
afterEach(clean);

async function insertProfile(opts: {
  suffix: string;
  role: "member" | "admin";
  status: "active" | "pending" | "inactive";
  createdAt: Date;
}) {
  const [row] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}${opts.suffix}`,
      email: `${opts.suffix}@x.lk`,
      fullName: `Inactivate ${opts.suffix}`,
      role: opts.role,
      status: opts.status,
      createdAt: opts.createdAt,
    })
    .returning();
  return row;
}

async function insertCheckin(memberId: string, when: Date) {
  await db.insert(attendance).values({
    memberId,
    checkedInAt: when,
    source: "kiosk_id",
  });
}

describe("_inactivateStaleMembersUnsafe", () => {
  it("flips a member with last check-in 200 days ago", async () => {
    const m = await insertProfile({
      suffix: "lapsed",
      role: "member",
      status: "active",
      createdAt: new Date("2025-05-01"),
    });
    await insertCheckin(m.id, new Date("2025-10-28")); // ~200 days before 2026-05-16
    await _inactivateStaleMembersUnsafe({ todaySL: "2026-05-16" });
    const [after] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, m.id));
    expect(after.status).toBe("inactive");
  });

  it("leaves a member with a recent check-in active", async () => {
    const m = await insertProfile({
      suffix: "recent",
      role: "member",
      status: "active",
      createdAt: new Date("2025-05-01"),
    });
    await insertCheckin(m.id, new Date("2026-04-30")); // 16 days before today
    await _inactivateStaleMembersUnsafe({ todaySL: "2026-05-16" });
    const [after] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, m.id));
    expect(after.status).toBe("active");
  });

  it("leaves a never-checked-in member with a recent created_at active", async () => {
    const m = await insertProfile({
      suffix: "newbie",
      role: "member",
      status: "active",
      createdAt: new Date("2026-05-01"), // 15 days before today
    });
    await _inactivateStaleMembersUnsafe({ todaySL: "2026-05-16" });
    const [after] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, m.id));
    expect(after.status).toBe("active");
  });

  it("flips a never-checked-in member whose created_at is 200 days ago", async () => {
    const m = await insertProfile({
      suffix: "ghost",
      role: "member",
      status: "active",
      createdAt: new Date("2025-10-28"), // ~200 days before today
    });
    await _inactivateStaleMembersUnsafe({ todaySL: "2026-05-16" });
    const [after] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, m.id));
    expect(after.status).toBe("inactive");
  });

  it("never flips an admin profile, even if last check-in is >180 days ago", async () => {
    const a = await insertProfile({
      suffix: "admin",
      role: "admin",
      status: "active",
      createdAt: new Date("2025-01-01"), // very old
    });
    await _inactivateStaleMembersUnsafe({ todaySL: "2026-05-16" });
    const [after] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, a.id));
    expect(after.status).toBe("active");
  });
});
