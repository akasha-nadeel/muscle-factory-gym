import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, payments } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { _createCheckoutUnsafe } from "@/lib/payhere/checkout";

const CLERK_PREFIX = "user_phase4_checkout_";
const PLAN_NAME = "Phase4CheckoutPlan";
const PLAN_NAME_DISABLED = "Phase4CheckoutPlanDisabled";

async function clean() {
  const ms = await db
    .select()
    .from(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  for (const m of ms) {
    await db.delete(payments).where(eq(payments.memberId, m.id));
  }
  await db.delete(plans).where(eq(plans.name, PLAN_NAME));
  await db.delete(plans).where(eq(plans.name, PLAN_NAME_DISABLED));
  await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
}

let memberId: string;
let activePlanId: string;
let disabledPlanId: string;

beforeEach(async () => {
  await clean();
  const [pl] = await db
    .insert(plans)
    .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "1500" })
    .returning();
  activePlanId = pl.id;
  const [plD] = await db
    .insert(plans)
    .values({
      name: PLAN_NAME_DISABLED,
      durationDays: 30,
      priceLkr: "1500",
      isActive: false,
    })
    .returning();
  disabledPlanId = plD.id;
  const [m] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}member`,
      email: "checkout@x.lk",
      fullName: "Checkout Member",
      role: "member",
      status: "active",
    })
    .returning();
  memberId = m.id;
});

afterEach(clean);

describe("_createCheckoutUnsafe", () => {
  it("inserts a pending payments row and returns CheckoutFields with correct hash", async () => {
    const result = await _createCheckoutUnsafe({
      memberId,
      planId: activePlanId,
      merchantId: "1230000",
      merchantSecret: "test-secret",
      returnUrl: "http://localhost:3000/portal/pay/confirm",
      cancelUrl: "http://localhost:3000/portal/pay/confirm",
      notifyUrl: "http://localhost:3000/api/payments/payhere/webhook",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.reference).toMatch(/^gym_/);

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.reference, result.reference));
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.status).toBe("pending");
    expect(row.method).toBe("payhere");
    expect(row.kind).toBe("membership");
    expect(row.amountLkr).toBe("1500.00");
    expect(row.memberId).toBe(memberId);
    expect(row.planId).toBe(activePlanId);
    expect(row.membershipId).toBeNull();
    expect(row.recordedBy).toBe(memberId);

    expect(result.fields.order_id).toBe(result.reference);
    expect(result.fields.amount).toBe("1500.00");
    expect(result.fields.currency).toBe("LKR");
    expect(typeof result.fields.hash).toBe("string");
    expect(result.fields.hash.length).toBe(32);
  });

  it("rejects when plan is inactive", async () => {
    const result = await _createCheckoutUnsafe({
      memberId,
      planId: disabledPlanId,
      merchantId: "1230000",
      merchantSecret: "test-secret",
      returnUrl: "x",
      cancelUrl: "x",
      notifyUrl: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/plan/i);
    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, memberId));
    expect(rows.length).toBe(0);
  });

  it("rejects when member is not active", async () => {
    await db
      .update(profiles)
      .set({ status: "pending" })
      .where(eq(profiles.id, memberId));
    const result = await _createCheckoutUnsafe({
      memberId,
      planId: activePlanId,
      merchantId: "1230000",
      merchantSecret: "test-secret",
      returnUrl: "x",
      cancelUrl: "x",
      notifyUrl: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/member/i);
  });

  it("rejects when member does not exist", async () => {
    const result = await _createCheckoutUnsafe({
      memberId: "00000000-0000-0000-0000-000000000000",
      planId: activePlanId,
      merchantId: "1230000",
      merchantSecret: "test-secret",
      returnUrl: "x",
      cancelUrl: "x",
      notifyUrl: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/member/i);
  });
});
