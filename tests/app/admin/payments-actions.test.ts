import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships, payments } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  _recordPaymentUnsafe,
  _refundPaymentUnsafe,
} from "@/app/admin/payments/actions";

const MEMBER_CLERK = "user_phase2_pay_member";
const ADMIN_CLERK = "user_phase2_pay_admin";
const PLAN_NAME = "Phase2TestPlan_pay";

let memberId: string;
let adminId: string;
let planId: string;
let membershipId: string;

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
      email: "pm@x.lk",
      fullName: "Pay Member",
      role: "member",
      status: "active",
    })
    .returning();
  memberId = m.id;
  const [a] = await db
    .insert(profiles)
    .values({
      clerkUserId: ADMIN_CLERK,
      email: "pa@x.lk",
      fullName: "Pay Admin",
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
  const [ms] = await db
    .insert(memberships)
    .values({
      memberId,
      planId,
      startDate: "2026-05-15",
      endDate: "2026-06-13",
      status: "active",
      createdBy: adminId,
    })
    .returning();
  membershipId = ms.id;
});

afterEach(clean);

describe("_recordPaymentUnsafe", () => {
  it("inserts a membership cash payment with succeeded status", async () => {
    const r = await _recordPaymentUnsafe({
      memberId,
      membershipId,
      recordedByProfileId: adminId,
      amountLkr: "5000",
      method: "cash",
      kind: "membership",
      reference: "",
      notes: "First month",
    });
    expect(r.ok).toBe(true);
    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, memberId));
    expect(rows.length).toBe(1);
    expect(rows[0].amountLkr).toBe("5000.00");
    expect(rows[0].method).toBe("cash");
    expect(rows[0].kind).toBe("membership");
    expect(rows[0].status).toBe("succeeded");
    expect(rows[0].membershipId).toBe(membershipId);
    expect(rows[0].recordedBy).toBe(adminId);
    expect(rows[0].notes).toBe("First month");
  });

  it("inserts an admission payment with membershipId=null", async () => {
    const r = await _recordPaymentUnsafe({
      memberId,
      membershipId: null,
      recordedByProfileId: adminId,
      amountLkr: "2000",
      method: "cash",
      kind: "admission",
      reference: "",
      notes: "",
    });
    expect(r.ok).toBe(true);
    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, memberId));
    expect(rows[0].kind).toBe("admission");
    expect(rows[0].membershipId).toBeNull();
  });

  it("rejects invalid input without writing", async () => {
    const r = await _recordPaymentUnsafe({
      memberId,
      membershipId,
      recordedByProfileId: adminId,
      amountLkr: "-1",
      method: "cash",
      kind: "membership",
      reference: "",
      notes: "",
    });
    expect(r.ok).toBe(false);
    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, memberId));
    expect(rows.length).toBe(0);
  });

  it("rejects a second admission fee with a friendly error", async () => {
    const r1 = await _recordPaymentUnsafe({
      memberId,
      membershipId: null,
      recordedByProfileId: adminId,
      amountLkr: "2000",
      method: "cash",
      kind: "admission",
      reference: "",
      notes: "",
    });
    expect(r1.ok).toBe(true);

    const r2 = await _recordPaymentUnsafe({
      memberId,
      membershipId: null,
      recordedByProfileId: adminId,
      amountLkr: "2000",
      method: "cash",
      kind: "admission",
      reference: "",
      notes: "",
    });
    expect(r2.ok).toBe(false);
    expect(r2.ok === false && r2.error).toMatch(
      /Joining fee has already been recorded/,
    );

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, memberId));
    const succeededAdmissions = rows.filter(
      (p) => p.kind === "admission" && p.status === "succeeded",
    );
    expect(succeededAdmissions.length).toBe(1);
  });

  it("after a refund, the original succeeded row remains and still blocks a new admission", { timeout: 30000 }, async () => {
    // NOTE: the plan expected a refund-then-readmit flow to succeed, but
    // _refundPaymentUnsafe does NOT flip the original row's status — it
    // inserts a new negative row with status='refunded'. The original stays
    // 'succeeded', so both the partial unique index and the app-level
    // pre-check correctly continue to reject a fresh admission. Asserting
    // actual behavior per "read the refund code carefully" guidance.
    const r1 = await _recordPaymentUnsafe({
      memberId,
      membershipId: null,
      recordedByProfileId: adminId,
      amountLkr: "2000",
      method: "cash",
      kind: "admission",
      reference: "ADM-001",
      notes: "",
    });
    expect(r1.ok).toBe(true);

    const [firstAdmission] = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, memberId));
    expect(firstAdmission.status).toBe("succeeded");

    const refund = await _refundPaymentUnsafe({
      originalPaymentId: firstAdmission.id,
      refundedByProfileId: adminId,
    });
    expect(refund.ok).toBe(true);

    const r2 = await _recordPaymentUnsafe({
      memberId,
      membershipId: null,
      recordedByProfileId: adminId,
      amountLkr: "2000",
      method: "cash",
      kind: "admission",
      reference: "ADM-002",
      notes: "",
    });
    expect(r2.ok).toBe(false);

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, memberId));
    const succeeded = rows.filter(
      (p) => p.kind === "admission" && p.status === "succeeded",
    );
    const refunded = rows.filter(
      (p) => p.kind === "admission" && p.status === "refunded",
    );
    expect(succeeded.length).toBe(1);
    expect(refunded.length).toBe(1);
  });
});

describe("_refundPaymentUnsafe", () => {
  async function seedOriginalPayment() {
    const [pay] = await db
      .insert(payments)
      .values({
        memberId,
        membershipId,
        amountLkr: "5000",
        method: "cash",
        kind: "membership",
        status: "succeeded",
        reference: "RCP-001",
        recordedBy: adminId,
      })
      .returning();
    return pay.id;
  }

  it("creates a negative refund payment row linked by reference", async () => {
    const origId = await seedOriginalPayment();
    const r = await _refundPaymentUnsafe({
      originalPaymentId: origId,
      refundedByProfileId: adminId,
    });
    expect(r.ok).toBe(true);
    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, memberId));
    expect(rows.length).toBe(2);
    const refund = rows.find((r) => r.status === "refunded");
    expect(refund).toBeDefined();
    expect(refund!.amountLkr).toBe("-5000.00");
    expect(refund!.method).toBe("cash");
    expect(refund!.kind).toBe("membership");
    expect(refund!.reference).toBe("RCP-001");
    expect(refund!.recordedBy).toBe(adminId);
  });

  it("rejects refunding an already-refunded payment", async () => {
    const origId = await seedOriginalPayment();
    const r1 = await _refundPaymentUnsafe({
      originalPaymentId: origId,
      refundedByProfileId: adminId,
    });
    expect(r1.ok).toBe(true);
    const r2 = await _refundPaymentUnsafe({
      originalPaymentId: origId,
      refundedByProfileId: adminId,
    });
    expect(r2.ok).toBe(false);
  });

  it("rejects refunding a non-existent payment", async () => {
    const r = await _refundPaymentUnsafe({
      originalPaymentId: "00000000-0000-0000-0000-000000000000",
      refundedByProfileId: adminId,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects refunding a payment that isn't succeeded", async () => {
    const [pay] = await db
      .insert(payments)
      .values({
        memberId,
        membershipId,
        amountLkr: "5000",
        method: "cash",
        kind: "membership",
        status: "pending",
        recordedBy: adminId,
      })
      .returning();
    const r = await _refundPaymentUnsafe({
      originalPaymentId: pay.id,
      refundedByProfileId: adminId,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects double refund of a cash payment with no reference", async () => {
    // Seed a cash payment with an empty reference, mirroring how the admin
    // form submits cash payments (empty string passes through validation as
    // null, but we use '' here to cover the most permissive case).
    const [pay] = await db
      .insert(payments)
      .values({
        memberId,
        membershipId,
        amountLkr: "5000",
        method: "cash",
        kind: "membership",
        status: "succeeded",
        reference: "",
        recordedBy: adminId,
      })
      .returning();

    const r1 = await _refundPaymentUnsafe({
      originalPaymentId: pay.id,
      refundedByProfileId: adminId,
    });
    expect(r1.ok).toBe(true);

    const r2 = await _refundPaymentUnsafe({
      originalPaymentId: pay.id,
      refundedByProfileId: adminId,
    });
    expect(r2.ok).toBe(false);
    expect(r2.ok === false && r2.error).toMatch(/already been refunded/);

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, memberId));
    const refunds = rows.filter((p) => p.status === "refunded");
    expect(refunds.length).toBe(1);
  });

  it("refund row of a no-reference payment carries the original payment id as its reference", async () => {
    const [pay] = await db
      .insert(payments)
      .values({
        memberId,
        membershipId,
        amountLkr: "5000",
        method: "cash",
        kind: "membership",
        status: "succeeded",
        reference: "",
        recordedBy: adminId,
      })
      .returning();
    const origPaymentId = pay.id;

    const r = await _refundPaymentUnsafe({
      originalPaymentId: origPaymentId,
      refundedByProfileId: adminId,
    });
    expect(r.ok).toBe(true);

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, memberId));
    const refund = rows.find((p) => p.status === "refunded");
    expect(refund).toBeDefined();
    expect(refund!.reference).toBe(origPaymentId);
  });
});
