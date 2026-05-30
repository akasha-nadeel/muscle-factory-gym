import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, payments, plans, profiles } from "@/db/schema";
import { _renewMembershipUnsafe } from "@/app/admin/members/[id]/actions";

const CLERK_PREFIX = "user_phase18_renew_";
const PLAN_NAME = "Phase18RenewPlan";

const insertedProfileIds = new Set<string>();
const insertedPlanIds = new Set<string>();

async function clean() {
  for (const id of [...insertedProfileIds]) {
    await db.delete(payments).where(eq(payments.memberId, id));
    await db.delete(memberships).where(eq(memberships.memberId, id));
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

async function insertActiveProfile(suffix: string) {
  const [row] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}${suffix}`,
      email: `${suffix}@x.lk`,
      fullName: `Renew ${suffix}`,
      role: "member",
      status: "active",
    })
    .returning();
  insertedProfileIds.add(row.id);
  return row;
}

async function insertPlan(opts: {
  name?: string;
  durationDays?: number;
  priceLkr?: string;
  isActive?: boolean;
}) {
  const [row] = await db
    .insert(plans)
    .values({
      name: opts.name ?? PLAN_NAME,
      durationDays: opts.durationDays ?? 30,
      priceLkr: opts.priceLkr ?? "4500",
      isActive: opts.isActive ?? true,
    })
    .returning();
  insertedPlanIds.add(row.id);
  return row;
}

async function insertMembership(opts: {
  memberId: string;
  planId: string;
  startDate: string;
  endDate: string;
  status: "active" | "expired" | "cancelled";
  adminId?: string;
}) {
  const [row] = await db
    .insert(memberships)
    .values({
      memberId: opts.memberId,
      planId: opts.planId,
      startDate: opts.startDate,
      endDate: opts.endDate,
      status: opts.status,
      createdBy: opts.adminId ?? opts.memberId,
    })
    .returning();
  return row;
}

describe("_renewMembershipUnsafe", () => {
  it("creates a new active membership starting today after expiry (gap renewal)", async () => {
    const member = await insertActiveProfile("gap");
    const plan = await insertPlan({});
    // Old membership expired last month.
    await insertMembership({
      memberId: member.id,
      planId: plan.id,
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      status: "expired",
    });

    const r = await _renewMembershipUnsafe({
      memberId: member.id,
      planId: plan.id,
      renewedByProfileId: member.id,
      today: "2026-06-10",
    });
    expect(r.ok).toBe(true);

    const all = await db
      .select()
      .from(memberships)
      .where(eq(memberships.memberId, member.id));
    expect(all.length).toBe(2);
    const fresh = all.find((m) => m.status === "active");
    expect(fresh).toBeDefined();
    // Old end_date + 1 = 2026-05-01, but that's before today=2026-06-10, so
    // computeMembershipWindow clamps to today.
    expect(fresh!.startDate).toBe("2026-06-10");
    expect(fresh!.endDate).toBe("2026-07-09");
  });

  it("creates a new membership starting day-after current end (early renewal)", async () => {
    const member = await insertActiveProfile("early");
    const plan = await insertPlan({});
    // Current membership ends Jun 22; admin renews on Jun 18.
    await insertMembership({
      memberId: member.id,
      planId: plan.id,
      startDate: "2026-05-23",
      endDate: "2026-06-22",
      status: "active",
    });

    const r = await _renewMembershipUnsafe({
      memberId: member.id,
      planId: plan.id,
      renewedByProfileId: member.id,
      today: "2026-06-18",
    });
    expect(r.ok).toBe(true);

    const all = await db
      .select()
      .from(memberships)
      .where(eq(memberships.memberId, member.id))
      .orderBy(memberships.startDate);
    expect(all.length).toBe(2);
    // New one starts the day after the current one ends.
    expect(all[1].startDate).toBe("2026-06-23");
    expect(all[1].endDate).toBe("2026-07-22");
    expect(all[1].status).toBe("active");
  });

  it("starts a new cycle TODAY when the previous membership was cancelled (no stacking on a dead row)", async () => {
    // Regression: a cancelled membership's stale end_date used to leak
    // into the renewal stacking math, giving the member "free days"
    // between the cancellation and the dead row's end_date. After fix,
    // cancelled rows are ignored and the new cycle starts today.
    const member = await insertActiveProfile("cancelthenrenew");
    const plan = await insertPlan({});
    // Approved May 29; admin cancelled it on May 30.
    await insertMembership({
      memberId: member.id,
      planId: plan.id,
      startDate: "2026-05-29",
      endDate: "2026-06-27",
      status: "cancelled",
    });

    const r = await _renewMembershipUnsafe({
      memberId: member.id,
      planId: plan.id,
      renewedByProfileId: member.id,
      today: "2026-05-30",
    });
    expect(r.ok).toBe(true);

    const fresh = await db
      .select()
      .from(memberships)
      .where(eq(memberships.memberId, member.id))
      .orderBy(memberships.startDate);
    expect(fresh.length).toBe(2);
    const active = fresh.find((m) => m.status === "active");
    expect(active).toBeDefined();
    // The cancelled row's end (Jun 27) is ignored; new cycle starts today.
    expect(active!.startDate).toBe("2026-05-30");
    expect(active!.endDate).toBe("2026-06-28");
  });

  it("attaches the optional payment to the new membership row", async () => {
    const member = await insertActiveProfile("withpay");
    const plan = await insertPlan({});

    const r = await _renewMembershipUnsafe({
      memberId: member.id,
      planId: plan.id,
      renewedByProfileId: member.id,
      today: "2026-06-10",
      payment: {
        amountLkr: "4500",
        method: "cash",
        reference: "RNW-1",
        notes: "",
      },
    });
    expect(r.ok).toBe(true);

    const [newMembership] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.memberId, member.id));
    const pays = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, member.id));
    expect(pays.length).toBe(1);
    expect(pays[0].membershipId).toBe(newMembership.id);
    expect(pays[0].kind).toBe("membership");
    expect(pays[0].status).toBe("succeeded");
    expect(pays[0].amountLkr).toBe("4500.00");
  });

  it("rejects renewal for a wiped member", async () => {
    const member = await insertActiveProfile("wiped");
    const plan = await insertPlan({});
    // Simulate post-wipe state without invoking the cron.
    await db
      .update(profiles)
      .set({
        fullName: "Former member",
        email: null,
        clerkUserId: `removed:${member.id}`,
        status: "inactive",
      })
      .where(eq(profiles.id, member.id));

    const r = await _renewMembershipUnsafe({
      memberId: member.id,
      planId: plan.id,
      renewedByProfileId: member.id,
      today: "2026-06-10",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/removed/i);
    }
  });

  it("rejects renewal when the plan is disabled", async () => {
    const member = await insertActiveProfile("disabledplan");
    const plan = await insertPlan({ isActive: false });

    const r = await _renewMembershipUnsafe({
      memberId: member.id,
      planId: plan.id,
      renewedByProfileId: member.id,
      today: "2026-06-10",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/disabled/i);
    }
  });

  it("rejects renewal for a non-existent member", async () => {
    const plan = await insertPlan({});
    const r = await _renewMembershipUnsafe({
      memberId: "00000000-0000-0000-0000-000000000000",
      planId: plan.id,
      renewedByProfileId: plan.id,
      today: "2026-06-10",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/not found/i);
    }
  });
});
