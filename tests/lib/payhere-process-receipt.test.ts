import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships, payments } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { _processWebhookUnsafe } from "@/lib/payhere/process";

const CLERK_PREFIX = "user_phase6_test_receipt_";
const PLAN_NAME = "Phase6ReceiptPlan";

async function clean() {
  const ms = await db
    .select()
    .from(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  for (const m of ms) {
    await db.delete(payments).where(eq(payments.memberId, m.id));
    await db.delete(memberships).where(eq(memberships.memberId, m.id));
  }
  await db.delete(plans).where(eq(plans.name, PLAN_NAME));
  await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
}

let memberId: string;
let planId: string;

beforeEach(async () => {
  await clean();
  const [pl] = await db
    .insert(plans)
    .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "1500" })
    .returning();
  planId = pl.id;
  const [m] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}member`,
      email: "receipt@x.lk",
      fullName: "Receipt Member",
      role: "member",
      status: "active",
    })
    .returning();
  memberId = m.id;
});

afterEach(clean);

async function seedPending(reference: string) {
  await db.insert(payments).values({
    memberId,
    membershipId: null,
    planId,
    amountLkr: "1500.00",
    method: "payhere",
    kind: "membership",
    status: "pending",
    reference,
    recordedBy: memberId,
  });
}

function payload(reference: string) {
  return {
    merchant_id: "1230000",
    order_id: reference,
    payment_id: "PAY999",
    payhere_amount: "1500.00",
    payhere_currency: "LKR",
    status_code: "2" as const,
    md5sig: "VERIFIED-BY-ROUTE",
  };
}

describe("_processWebhookUnsafe — receipt context", () => {
  it("returns sendCtx on the first successful processing", async () => {
    const ref = "gym_receipt_test_1";
    await seedPending(ref);
    const result = await _processWebhookUnsafe({
      verified: payload(ref),
      todaySL: "2026-05-16",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome).toBe("succeeded");
    if (result.outcome !== "succeeded") return;
    expect(result.sendCtx).toBeDefined();
    expect(result.sendCtx.memberEmail).toBe("receipt@x.lk");
    expect(result.sendCtx.memberName).toBe("Receipt Member");
    expect(result.sendCtx.planName).toBe(PLAN_NAME);
    expect(result.sendCtx.amountLkr).toBe("1500.00");
    expect(result.sendCtx.newMembershipStart).toBe("2026-05-16");
    expect(result.sendCtx.newMembershipEnd).toBe("2026-06-14");
  });

  it("returns NO sendCtx on a duplicate webhook (already_processed)", async () => {
    const ref = "gym_receipt_test_2";
    await seedPending(ref);
    const first = await _processWebhookUnsafe({
      verified: payload(ref),
      todaySL: "2026-05-16",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.outcome).toBe("succeeded");

    const second = await _processWebhookUnsafe({
      verified: payload(ref),
      todaySL: "2026-05-16",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.outcome).toBe("already_processed");
    // Discriminated union — sendCtx only exists on the 'succeeded' branch
    expect("sendCtx" in second).toBe(false);
  });
});
