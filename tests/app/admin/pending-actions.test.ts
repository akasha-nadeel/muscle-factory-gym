import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships } from "@/db/schema";
import { eq } from "drizzle-orm";
import { _approveMemberUnsafe } from "@/app/admin/pending/actions";

const MEMBER_CLERK_ID = "user_pending_test_member";
const ADMIN_CLERK_ID = "user_pending_test_admin";
const PLAN_NAME = "TestPlan_pending_phase1";

let memberId: string;
let adminId: string;
let planId: string;

async function clean() {
  // children first
  const [mp] = await db.select().from(profiles).where(eq(profiles.clerkUserId, MEMBER_CLERK_ID));
  if (mp) await db.delete(memberships).where(eq(memberships.memberId, mp.id));
  await db.delete(plans).where(eq(plans.name, PLAN_NAME));
  await db.delete(profiles).where(eq(profiles.clerkUserId, MEMBER_CLERK_ID));
  await db.delete(profiles).where(eq(profiles.clerkUserId, ADMIN_CLERK_ID));
}

beforeEach(async () => {
  await clean();
  const [m] = await db
    .insert(profiles)
    .values({ clerkUserId: MEMBER_CLERK_ID, email: "m@x.lk", fullName: "Pending M", role: "member", status: "pending" })
    .returning();
  memberId = m.id;
  const [a] = await db
    .insert(profiles)
    .values({ clerkUserId: ADMIN_CLERK_ID, email: "a@x.lk", fullName: "Admin A", role: "admin", status: "active" })
    .returning();
  adminId = a.id;
  const [p] = await db
    .insert(plans)
    .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "5000" })
    .returning();
  planId = p.id;
});

afterEach(clean);

describe("approveMember", () => {
  it("flips status to active and inserts one membership", async () => {
    const r = await _approveMemberUnsafe({
      memberId,
      planId,
      approvedByProfileId: adminId,
      today: "2026-05-15",
    });
    expect(r.ok).toBe(true);

    const [profile] = await db.select().from(profiles).where(eq(profiles.id, memberId));
    expect(profile.status).toBe("active");

    const mems = await db.select().from(memberships).where(eq(memberships.memberId, memberId));
    expect(mems.length).toBe(1);
    expect(mems[0].planId).toBe(planId);
    expect(mems[0].status).toBe("active");
    expect(mems[0].createdBy).toBe(adminId);
    expect(mems[0].startDate).toBe("2026-05-15");
    expect(mems[0].endDate).toBe("2026-06-13"); // inclusive 30 days
  });

  it("rejects approving a member who is already active", async () => {
    await db.update(profiles).set({ status: "active" }).where(eq(profiles.id, memberId));
    const r = await _approveMemberUnsafe({
      memberId,
      planId,
      approvedByProfileId: adminId,
      today: "2026-05-15",
    });
    expect(r.ok).toBe(false);
    const mems = await db.select().from(memberships).where(eq(memberships.memberId, memberId));
    expect(mems.length).toBe(0);
  });

  it("rejects approving with a non-existent plan", async () => {
    const r = await _approveMemberUnsafe({
      memberId,
      planId: "00000000-0000-0000-0000-000000000000",
      approvedByProfileId: adminId,
      today: "2026-05-15",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects approving with a disabled plan", async () => {
    await db.update(plans).set({ isActive: false }).where(eq(plans.id, planId));
    const r = await _approveMemberUnsafe({
      memberId,
      planId,
      approvedByProfileId: adminId,
      today: "2026-05-15",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects approval when member already has an active membership", async () => {
    // Seed an existing active membership for this member (simulates the
    // racing-double-approval window where two transactions both pass the
    // line-38 status check and the second one would otherwise insert a
    // duplicate).
    await db.insert(memberships).values({
      memberId,
      planId,
      startDate: "2026-05-01",
      endDate: "2026-06-30",
      status: "active",
      createdBy: adminId,
    });

    const r = await _approveMemberUnsafe({
      memberId,
      planId,
      approvedByProfileId: adminId,
      today: "2026-05-15",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/already has an active membership/);
      expect(r.error).toContain("2026-06-30");
    }

    const mems = await db
      .select()
      .from(memberships)
      .where(eq(memberships.memberId, memberId));
    expect(mems.length).toBe(1);
  });

  it("allows approval when member only has expired or cancelled memberships", async () => {
    await db.insert(memberships).values({
      memberId,
      planId,
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      status: "expired",
      createdBy: adminId,
    });

    const r = await _approveMemberUnsafe({
      memberId,
      planId,
      approvedByProfileId: adminId,
      today: "2026-05-15",
    });
    expect(r.ok).toBe(true);

    const mems = await db
      .select()
      .from(memberships)
      .where(eq(memberships.memberId, memberId));
    expect(mems.length).toBe(2);
    const active = mems.filter((m) => m.status === "active");
    expect(active.length).toBe(1);
    expect(active[0].endDate).toBe("2026-06-13");
  });
});
