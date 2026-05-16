import { db } from "@/db";
import { payments, memberships, plans } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { computeNextMembershipWindow } from "@/lib/memberships/next-window";

export type VerifiedWebhookPayload = {
  merchant_id: string;
  order_id: string;
  payment_id?: string;
  payhere_amount: string;
  payhere_currency: string;
  status_code: string;
  md5sig: string;
  [key: string]: unknown;
};

export type ProcessOutcome =
  | "succeeded"
  | "failed"
  | "still_pending"
  | "already_processed";
export type ProcessReason = "row_not_found" | "amount_mismatch" | "no_plan";

export type ProcessResult =
  | { ok: true; outcome: ProcessOutcome }
  | { ok: false; reason: ProcessReason };

/**
 * Apply a signature-verified PayHere webhook to our payments row.
 *
 * Concurrency: opens a transaction and acquires a row-level lock
 * (FOR UPDATE) on the payments row keyed by `reference + method='payhere'`.
 * A simultaneous second delivery waits, then exits via the
 * `already_processed` branch.
 */
export async function _processWebhookUnsafe(input: {
  verified: VerifiedWebhookPayload;
  todaySL: string;
}): Promise<ProcessResult> {
  const { verified, todaySL } = input;
  const orderId = verified.order_id;
  const statusCode = verified.status_code;
  const reportedAmount = Number(verified.payhere_amount).toFixed(2);

  return await db.transaction(async (tx) => {
    // Drizzle's typed `.for("update")` emits `FOR UPDATE` on this SELECT,
    // acquiring a row-level lock for the rest of the transaction. We avoid raw
    // `tx.execute(sql`... for update`)` because that returns snake_case columns
    // from the postgres-js driver, defeating the typed-row contract elsewhere.
    const [row] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.reference, orderId),
          eq(payments.method, "payhere"),
        ),
      )
      .limit(1)
      .for("update");
    if (!row) return { ok: false, reason: "row_not_found" } as const;

    if (row.status === "succeeded") {
      return { ok: true, outcome: "already_processed" } as const;
    }

    if (Number(row.amountLkr).toFixed(2) !== reportedAmount) {
      return { ok: false, reason: "amount_mismatch" } as const;
    }

    if (statusCode === "0") {
      return { ok: true, outcome: "still_pending" } as const;
    }

    if (statusCode === "-1" || statusCode === "-2" || statusCode === "-3") {
      await tx
        .update(payments)
        .set({ status: "failed" })
        .where(eq(payments.id, row.id));
      return { ok: true, outcome: "failed" } as const;
    }

    if (statusCode !== "2") {
      // Unknown code — treat as a no-op so PayHere retries don't poison the row
      return { ok: true, outcome: "still_pending" } as const;
    }

    // Success path: read plan, compute next window, insert membership, flip row.
    if (!row.planId) {
      return { ok: false, reason: "no_plan" } as const;
    }
    // `isActive` is intentionally NOT filtered: if an admin disabled the plan
    // between the user's checkout click and PayHere's webhook, we still honor
    // the payment with the plan's stored `durationDays`. The plan's price was
    // already snapshotted onto `payments.amountLkr` at checkout time.
    const [plan] = await tx
      .select()
      .from(plans)
      .where(eq(plans.id, row.planId))
      .limit(1);
    if (!plan) return { ok: false, reason: "no_plan" } as const;

    const [latestActive] = await tx
      .select({ endDate: memberships.endDate })
      .from(memberships)
      .where(
        and(
          eq(memberships.memberId, row.memberId),
          eq(memberships.status, "active"),
        ),
      )
      .orderBy(desc(memberships.endDate))
      .limit(1);

    const window = computeNextMembershipWindow({
      today: todaySL,
      durationDays: plan.durationDays,
      latestActiveEndDate: latestActive?.endDate ?? null,
    });

    const [created] = await tx
      .insert(memberships)
      .values({
        memberId: row.memberId,
        planId: row.planId,
        startDate: window.startDate,
        endDate: window.endDate,
        status: "active",
        createdBy: row.memberId,
      })
      .returning({ id: memberships.id });

    await tx
      .update(payments)
      .set({ status: "succeeded", membershipId: created.id, paidAt: new Date() })
      .where(eq(payments.id, row.id));

    return { ok: true, outcome: "succeeded" } as const;
  });
}
