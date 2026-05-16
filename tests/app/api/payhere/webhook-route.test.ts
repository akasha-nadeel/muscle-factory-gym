import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { profiles, plans, memberships, payments } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { POST } from "@/app/api/payments/payhere/webhook/route";

const CLERK_PREFIX = "user_phase4_webhook_";
const PLAN_NAME = "Phase4WebhookPlan";
const MERCHANT_ID = "1230000";
const MERCHANT_SECRET = "webhook-test-secret";

function md5Upper(s: string): string {
  return createHash("md5").update(s).digest("hex").toUpperCase();
}

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
  process.env.PAYHERE_MERCHANT_ID = MERCHANT_ID;
  process.env.PAYHERE_MERCHANT_SECRET = MERCHANT_SECRET;

  const [pl] = await db
    .insert(plans)
    .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "1500" })
    .returning();
  planId = pl.id;
  const [m] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}member`,
      email: "webhook@x.lk",
      fullName: "Webhook Member",
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

function postForm(fields: Record<string, string>): Request {
  const body = new URLSearchParams(fields);
  return new Request("http://localhost/api/payments/payhere/webhook", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

function signedPayload(opts: {
  reference: string;
  amount?: string;
  statusCode: "2" | "0" | "-1" | "-2" | "-3";
}): Record<string, string> {
  const amount = opts.amount ?? "1500.00";
  const sig = md5Upper(
    MERCHANT_ID +
      opts.reference +
      amount +
      "LKR" +
      opts.statusCode +
      md5Upper(MERCHANT_SECRET),
  );
  return {
    merchant_id: MERCHANT_ID,
    order_id: opts.reference,
    payment_id: "PAY999",
    payhere_amount: amount,
    payhere_currency: "LKR",
    status_code: opts.statusCode,
    md5sig: sig,
  };
}

describe("POST /api/payments/payhere/webhook", () => {
  it("returns 401 on bad signature", async () => {
    const fields = signedPayload({
      reference: "gym_w1",
      statusCode: "2",
    });
    fields.md5sig = "0".repeat(32);
    const res = await POST(postForm(fields));
    expect(res.status).toBe(401);
  });

  it("returns 200 + flips the pending row on a verified success", async () => {
    const ref = "gym_w2";
    await seedPending(ref);
    const res = await POST(postForm(signedPayload({ reference: ref, statusCode: "2" })));
    expect(res.status).toBe(200);
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.reference, ref));
    expect(row.status).toBe("succeeded");
    expect(row.membershipId).not.toBeNull();
  });

  it("returns 200 + flips to failed on status_code -2", async () => {
    const ref = "gym_w3";
    await seedPending(ref);
    const res = await POST(postForm(signedPayload({ reference: ref, statusCode: "-2" })));
    expect(res.status).toBe(200);
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.reference, ref));
    expect(row.status).toBe("failed");
  });

  it("returns 200 on row_not_found (no DB write)", async () => {
    const res = await POST(
      postForm(signedPayload({ reference: "gym_w_unknown", statusCode: "2" })),
    );
    expect(res.status).toBe(200);
  });
});
