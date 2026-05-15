import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships, payments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { _approveMemberUnsafe } from "@/app/admin/pending/actions";

const MEMBER_CLERK = "user_phase2_approve_with_pay";
const ADMIN_CLERK = "user_phase2_approve_with_pay_admin";
const PLAN_NAME = "Phase2ApprovePayPlan";

let memberId: string;
let adminId: string;
let planId: string;

async function clean() {
  const [mp] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.clerkUserId, MEMBER_CLERK));
  if (mp) {
    await db.delete(payments).where(eq(payments.memberId, mp.id));
    await db.delete(memberships).where(eq(memberships.memberId, mp.id));
  }
  await db.delete(plans).where(eq(plans.name, PLAN_NAME));
  await db.delete(profiles).where(eq(profiles.clerkUserId, MEMBER_CLERK));
  await db.delete(profiles).where(eq(profiles.clerkUserId, ADMIN_CLERK));
}

beforeEach(async () => {
  await clean();
  const [m] = await db
    .insert(profiles)
    .values({
      clerkUserId: MEMBER_CLERK,
      email: "apm@x.lk",
      fullName: "Approve Pay Member",
      role: "member",
      status: "pending",
    })
    .returning();
  memberId = m.id;
  const [a] = await db
    .insert(profiles)
    .values({
      clerkUserId: ADMIN_CLERK,
      email: "apa@x.lk",
      fullName: "Approve Pay Admin",
      role: "admin",
      status: "active",
    })
    .returning();
  adminId = a.id;
  const [pl] = await db
    .insert(plans)
    .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "5000" })
    .returning();
  planId = pl.id;
});

afterEach(clean);

describe("_approveMemberUnsafe with optional payments", () => {
  it("approves without payments (existing Phase 1 behavior)", async () => {
    const r = await _approveMemberUnsafe({
      memberId,
      planId,
      approvedByProfileId: adminId,
      today: "2026-05-15",
    });
    expect(r.ok).toBe(true);
    const mems = await db.select().from(memberships).where(eq(memberships.memberId, memberId));
    expect(mems.length).toBe(1);
    const pays = await db.select().from(payments).where(eq(payments.memberId, memberId));
    expect(pays.length).toBe(0);
  });

  it("approves AND inserts initial membership payment when provided", async () => {
    const r = await _approveMemberUnsafe({
      memberId,
      planId,
      approvedByProfileId: adminId,
      today: "2026-05-15",
      initialMembershipPayment: {
        amountLkr: "5000",
        method: "cash",
        reference: "",
        notes: "",
      },
    });
    expect(r.ok).toBe(true);
    const mems = await db.select().from(memberships).where(eq(memberships.memberId, memberId));
    expect(mems.length).toBe(1);
    const pays = await db.select().from(payments).where(eq(payments.memberId, memberId));
    expect(pays.length).toBe(1);
    expect(pays[0].kind).toBe("membership");
    expect(pays[0].membershipId).toBe(mems[0].id);
    expect(pays[0].amountLkr).toBe("5000.00");
    expect(pays[0].method).toBe("cash");
    expect(pays[0].status).toBe("succeeded");
  });

  it("approves AND inserts admission fee when provided", async () => {
    const r = await _approveMemberUnsafe({
      memberId,
      planId,
      approvedByProfileId: adminId,
      today: "2026-05-15",
      admissionFee: {
        amountLkr: "2000",
        method: "cash",
        reference: "",
        notes: "",
      },
    });
    expect(r.ok).toBe(true);
    const pays = await db.select().from(payments).where(eq(payments.memberId, memberId));
    expect(pays.length).toBe(1);
    expect(pays[0].kind).toBe("admission");
    expect(pays[0].membershipId).toBeNull();
    expect(pays[0].amountLkr).toBe("2000.00");
  });

  it("approves AND inserts BOTH admission + membership payments atomically", async () => {
    const r = await _approveMemberUnsafe({
      memberId,
      planId,
      approvedByProfileId: adminId,
      today: "2026-05-15",
      admissionFee: { amountLkr: "2000", method: "cash", reference: "", notes: "" },
      initialMembershipPayment: { amountLkr: "5000", method: "cash", reference: "", notes: "" },
    });
    expect(r.ok).toBe(true);
    const pays = await db.select().from(payments).where(eq(payments.memberId, memberId));
    expect(pays.length).toBe(2);
    expect(pays.find((p) => p.kind === "admission")?.amountLkr).toBe("2000.00");
    expect(pays.find((p) => p.kind === "membership")?.amountLkr).toBe("5000.00");
  });

  it("rolls back the whole transaction if a payment is invalid", async () => {
    const r = await _approveMemberUnsafe({
      memberId,
      planId,
      approvedByProfileId: adminId,
      today: "2026-05-15",
      initialMembershipPayment: {
        amountLkr: "-100", // invalid
        method: "cash",
        reference: "",
        notes: "",
      },
    });
    expect(r.ok).toBe(false);
    // Membership should NOT have been created either.
    const mems = await db.select().from(memberships).where(eq(memberships.memberId, memberId));
    expect(mems.length).toBe(0);
    const [member] = await db.select().from(profiles).where(eq(profiles.id, memberId));
    expect(member.status).toBe("pending"); // status flip rolled back too
  });
});
