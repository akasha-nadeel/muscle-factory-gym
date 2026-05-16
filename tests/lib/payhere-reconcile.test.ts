import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships, payments } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { _reconcilePendingUnsafe } from "@/lib/payhere/reconcile";
import type { PayHereStatus } from "@/lib/payhere/api";

const CLERK_PREFIX = "user_phase4_reconcile_";
const PLAN_NAME = "Phase4ReconcilePlan";

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
  paidAt: Date;
}) {
  await db.insert(payments).values({
    memberId,
    membershipId: null,
    planId,
    amountLkr: "1500.00",
    method: "payhere",
    kind: "membership",
    status: "pending",
    reference: opts.reference,
    recordedBy: memberId,
    paidAt: opts.paidAt,
  });
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
      email: "reconcile@x.lk",
      fullName: "Reconcile Member",
      role: "member",
      status: "active",
    })
    .returning();
  memberId = m.id;
});

afterEach(clean);

describe("_reconcilePendingUnsafe", () => {
  it("processes rows older than 1h, skips fresh rows", async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000 - 1000);
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    await seedPending({ reference: "gym_old_success", paidAt: oneHourAgo });
    await seedPending({ reference: "gym_old_fail", paidAt: oneHourAgo });
    await seedPending({ reference: "gym_fresh", paidAt: fiveMinAgo });

    const fakeFetch = async (ref: string): Promise<PayHereStatus> => {
      if (ref === "gym_old_success")
        return {
          kind: "found",
          statusCode: "2",
          amount: "1500.00",
          currency: "LKR",
        };
      if (ref === "gym_old_fail")
        return {
          kind: "found",
          statusCode: "-2",
          amount: "1500.00",
          currency: "LKR",
        };
      throw new Error("should not be called for fresh row");
    };

    const summary = await _reconcilePendingUnsafe({
      fetchStatus: fakeFetch,
      todaySL: "2026-05-16",
      merchantId: "1230000",
      merchantSecret: "test-secret",
    });

    expect(summary.processed).toBe(2);
    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.still_pending).toBe(0);

    const [success] = await db
      .select()
      .from(payments)
      .where(eq(payments.reference, "gym_old_success"));
    expect(success.status).toBe("succeeded");

    const [failed] = await db
      .select()
      .from(payments)
      .where(eq(payments.reference, "gym_old_fail"));
    expect(failed.status).toBe("failed");

    const [fresh] = await db
      .select()
      .from(payments)
      .where(eq(payments.reference, "gym_fresh"));
    expect(fresh.status).toBe("pending");
  });

  it("treats PayHere 'not found' on a >24h-old row as failed (abandoned checkout)", async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await seedPending({
      reference: "gym_abandoned",
      paidAt: twentyFiveHoursAgo,
    });

    const fakeFetch = async (): Promise<PayHereStatus> => ({ kind: "not_found" });
    const summary = await _reconcilePendingUnsafe({
      fetchStatus: fakeFetch,
      todaySL: "2026-05-16",
      merchantId: "1230000",
      merchantSecret: "test-secret",
    });
    expect(summary.failed).toBe(1);
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.reference, "gym_abandoned"));
    expect(row.status).toBe("failed");
  });

  it("leaves <24h 'not found' rows alone (still pending)", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await seedPending({ reference: "gym_recent_nf", paidAt: twoHoursAgo });
    const summary = await _reconcilePendingUnsafe({
      fetchStatus: async () => ({ kind: "not_found" }),
      todaySL: "2026-05-16",
      merchantId: "1230000",
      merchantSecret: "test-secret",
    });
    expect(summary.still_pending).toBe(1);
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.reference, "gym_recent_nf"));
    expect(row.status).toBe("pending");
  });

  it("counts thrown fetch errors as still_pending and continues with other rows", async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000 - 1000);
    await seedPending({ reference: "gym_err", paidAt: oneHourAgo });
    await seedPending({ reference: "gym_ok", paidAt: oneHourAgo });

    const fakeFetch = async (ref: string): Promise<PayHereStatus> => {
      if (ref === "gym_err") throw new Error("upstream down");
      return {
        kind: "found",
        statusCode: "2",
        amount: "1500.00",
        currency: "LKR",
      };
    };

    const summary = await _reconcilePendingUnsafe({
      fetchStatus: fakeFetch,
      todaySL: "2026-05-16",
      merchantId: "1230000",
      merchantSecret: "test-secret",
    });
    expect(summary.processed).toBe(2);
    expect(summary.succeeded).toBe(1);
    expect(summary.still_pending).toBe(1);
  });
});
