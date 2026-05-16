import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships, payments } from "@/db/schema";
import { eq, like, and } from "drizzle-orm";
import { _processWebhookUnsafe } from "@/lib/payhere/process";

const CLERK_PREFIX = "user_phase4_process_";
const PLAN_NAME = "Phase4ProcessPlan";

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

async function seedPending(opts: {
  reference: string;
  amount?: string;
}): Promise<string> {
  const [row] = await db
    .insert(payments)
    .values({
      memberId,
      membershipId: null,
      planId,
      amountLkr: opts.amount ?? "1500.00",
      method: "payhere",
      kind: "membership",
      status: "pending",
      reference: opts.reference,
      recordedBy: memberId,
    })
    .returning();
  return row.id;
}

function payload(opts: {
  reference: string;
  amount?: string;
  statusCode: "2" | "0" | "-1" | "-2" | "-3";
}) {
  return {
    merchant_id: "1230000",
    order_id: opts.reference,
    payment_id: "PAY123",
    payhere_amount: opts.amount ?? "1500.00",
    payhere_currency: "LKR",
    status_code: opts.statusCode,
    md5sig: "VERIFIED-BY-ROUTE-HANDLER",
  };
}

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
      email: "process@x.lk",
      fullName: "Process Member",
      role: "member",
      status: "active",
    })
    .returning();
  memberId = m.id;
});

afterEach(clean);

describe("_processWebhookUnsafe", () => {
  it("flips pending → succeeded and creates a membership (no prior)", async () => {
    const ref = "gym_test_success_1";
    await seedPending({ reference: ref });
    const r = await _processWebhookUnsafe({
      verified: payload({ reference: ref, statusCode: "2" }),
      todaySL: "2026-05-16",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome).toBe("succeeded");

    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.reference, ref));
    expect(row.status).toBe("succeeded");
    expect(row.membershipId).not.toBeNull();

    const ms = await db
      .select()
      .from(memberships)
      .where(eq(memberships.id, row.membershipId!));
    expect(ms.length).toBe(1);
    expect(ms[0].startDate).toBe("2026-05-16");
    expect(ms[0].endDate).toBe("2026-06-14");
    expect(ms[0].status).toBe("active");
    expect(ms[0].createdBy).toBe(memberId);
  });

  it("stacks new membership when prior is still active", async () => {
    await db.insert(memberships).values({
      memberId,
      planId,
      startDate: "2026-04-15",
      endDate: "2026-06-01",
      status: "active",
      createdBy: memberId,
    });
    const ref = "gym_test_stack";
    await seedPending({ reference: ref });
    const r = await _processWebhookUnsafe({
      verified: payload({ reference: ref, statusCode: "2" }),
      todaySL: "2026-05-16",
    });
    expect(r.ok).toBe(true);
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.reference, ref));
    const [ms] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.id, row.membershipId!));
    expect(ms.startDate).toBe("2026-06-02");
    expect(ms.endDate).toBe("2026-07-01");
  });

  it("returns already_processed on a duplicate webhook (idempotent)", async () => {
    const ref = "gym_test_dup";
    await seedPending({ reference: ref });
    const first = await _processWebhookUnsafe({
      verified: payload({ reference: ref, statusCode: "2" }),
      todaySL: "2026-05-16",
    });
    expect(first.ok).toBe(true);
    const second = await _processWebhookUnsafe({
      verified: payload({ reference: ref, statusCode: "2" }),
      todaySL: "2026-05-16",
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.outcome).toBe("already_processed");

    const all = await db
      .select()
      .from(memberships)
      .where(eq(memberships.memberId, memberId));
    expect(all.length).toBe(1);
  });

  it("flips pending → failed on status_code -1/-2/-3 and creates no membership", async () => {
    for (const sc of ["-1", "-2", "-3"] as const) {
      const ref = `gym_test_fail_${sc}`;
      await seedPending({ reference: ref });
      const r = await _processWebhookUnsafe({
        verified: payload({ reference: ref, statusCode: sc }),
        todaySL: "2026-05-16",
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.outcome).toBe("failed");
      const [row] = await db
        .select()
        .from(payments)
        .where(eq(payments.reference, ref));
      expect(row.status).toBe("failed");
      expect(row.membershipId).toBeNull();
    }
    const ms = await db
      .select()
      .from(memberships)
      .where(eq(memberships.memberId, memberId));
    expect(ms.length).toBe(0);
  });

  it("returns amount_mismatch and leaves row pending", async () => {
    const ref = "gym_test_amount";
    await seedPending({ reference: ref, amount: "1500.00" });
    const r = await _processWebhookUnsafe({
      verified: payload({ reference: ref, amount: "100.00", statusCode: "2" }),
      todaySL: "2026-05-16",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("amount_mismatch");
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.reference, ref));
    expect(row.status).toBe("pending");
  });

  it("returns row_not_found and writes nothing", async () => {
    const r = await _processWebhookUnsafe({
      verified: payload({ reference: "gym_does_not_exist", statusCode: "2" }),
      todaySL: "2026-05-16",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("row_not_found");
  });

  it("is a no-op on status_code 0 (still pending)", async () => {
    const ref = "gym_test_pending";
    await seedPending({ reference: ref });
    const r = await _processWebhookUnsafe({
      verified: payload({ reference: ref, statusCode: "0" }),
      todaySL: "2026-05-16",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.outcome).toBe("still_pending");
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.reference, ref));
    expect(row.status).toBe("pending");
  });

  it("succeeds even if plan was deactivated between checkout and webhook", async () => {
    const ref = "gym_test_deactivated";
    await seedPending({ reference: ref });
    await db.update(plans).set({ isActive: false }).where(eq(plans.id, planId));
    const r = await _processWebhookUnsafe({
      verified: payload({ reference: ref, statusCode: "2" }),
      todaySL: "2026-05-16",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.outcome).toBe("succeeded");
  });
});
