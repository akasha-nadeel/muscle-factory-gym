import { db } from "@/db";
import { payments } from "@/db/schema";
import { and, eq, lt } from "drizzle-orm";
import { _processWebhookUnsafe } from "./process";
import type { PayHereStatus } from "./api";

export type ReconcileSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  still_pending: number;
};

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function _reconcilePendingUnsafe(input: {
  fetchStatus: (reference: string) => Promise<PayHereStatus>;
  todaySL: string;
  merchantId: string;
  merchantSecret: string;
}): Promise<ReconcileSummary> {
  const cutoff = new Date(Date.now() - ONE_HOUR_MS);
  const pendingRows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.status, "pending"),
        eq(payments.method, "payhere"),
        lt(payments.paidAt, cutoff),
      ),
    );

  const summary: ReconcileSummary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    still_pending: 0,
  };

  for (const row of pendingRows) {
    summary.processed++;
    if (!row.reference) {
      summary.still_pending++;
      continue;
    }
    let status: PayHereStatus;
    try {
      status = await input.fetchStatus(row.reference);
    } catch {
      summary.still_pending++;
      continue;
    }

    if (status.kind === "not_found") {
      // >24h-old + PayHere never heard of it → abandoned. Flip to failed.
      const age = Date.now() - new Date(row.paidAt).getTime();
      if (age > TWENTY_FOUR_HOURS_MS) {
        await db
          .update(payments)
          .set({ status: "failed" })
          .where(eq(payments.id, row.id));
        summary.failed++;
      } else {
        summary.still_pending++;
      }
      continue;
    }

    const result = await _processWebhookUnsafe({
      verified: {
        merchant_id: input.merchantId,
        order_id: row.reference,
        payhere_amount: status.amount,
        payhere_currency: status.currency,
        status_code: status.statusCode,
        md5sig: "RECONCILE-AUTHORITATIVE",
      },
      todaySL: input.todaySL,
    });

    if (!result.ok) {
      summary.still_pending++;
      continue;
    }
    switch (result.outcome) {
      case "succeeded":
        summary.succeeded++;
        break;
      case "failed":
        summary.failed++;
        break;
      case "still_pending":
      case "already_processed":
        summary.still_pending++;
        break;
    }
  }

  return summary;
}
