import { NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { memberships, payments, plans, profiles } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { isWiped } from "@/lib/profiles/wiped";
import { computeOutstanding } from "@/lib/payments/outstanding";
import {
  computeNextPaymentDue,
  inferCyclePeriod,
} from "@/lib/payments/next-due";
import { todayInSL } from "@/lib/tz";

/**
 * Payment context for the dashboard's "Record payment" modal:
 *   - cycle-aware outstanding balance on the current membership
 *   - next-payment-due date
 *   - plan price (used for the quick-fill pill button)
 *   - the member's last succeeded payment (membership or admission)
 *
 * Returns nulls in the membership fields when the member has no active
 * membership — the modal then defaults to admission-only.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [member] = await db
    .select({ id: profiles.id, clerkUserId: profiles.clerkUserId })
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  if (!member) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (isWiped(member)) {
    // Defense in depth — the picker already filters wiped members but a
    // stale modal could still hold one.
    return NextResponse.json({ error: "member removed" }, { status: 410 });
  }

  const today = todayInSL();

  const [current] = await db
    .select({
      id: memberships.id,
      startDate: memberships.startDate,
      endDate: memberships.endDate,
      planPriceLkr: plans.priceLkr,
      planName: plans.name,
    })
    .from(memberships)
    .innerJoin(plans, eq(plans.id, memberships.planId))
    .where(
      and(
        eq(memberships.memberId, id),
        eq(memberships.status, "active"),
        gte(memberships.endDate, today),
      ),
    )
    .orderBy(desc(memberships.endDate))
    .limit(1);

  const paymentRows = await db
    .select({
      id: payments.id,
      amountLkr: payments.amountLkr,
      kind: payments.kind,
      status: payments.status,
      membershipId: payments.membershipId,
      method: payments.method,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(eq(payments.memberId, id))
    .orderBy(desc(payments.paidAt));

  const outstandingLkr = current
    ? computeOutstanding({
        planPriceLkr: current.planPriceLkr,
        payments: paymentRows.map((p) => ({
          id: p.id,
          amountLkr: p.amountLkr,
          kind: p.kind,
          status: p.status,
          membershipId: p.membershipId,
        })),
        membershipId: current.id,
        cycleContext: {
          startDate: current.startDate,
          today,
          cyclePeriod: inferCyclePeriod(current.planName),
        },
      })
    : null;

  const nextPaymentDue = current
    ? computeNextPaymentDue({
        membershipStart: current.startDate,
        cyclePeriod: inferCyclePeriod(current.planName),
        today,
      })
    : null;

  const lastSucceeded = paymentRows.find((p) => p.status === "succeeded");
  const lastPayment = lastSucceeded
    ? {
        amountLkr: lastSucceeded.amountLkr,
        paidAt: lastSucceeded.paidAt,
        method: lastSucceeded.method,
        kind: lastSucceeded.kind,
      }
    : null;

  // Derived from the same paymentRows already in memory — no extra query.
  // The schema's partial unique index (payments_admission_per_member_unique)
  // guarantees at most one succeeded admission row, so .find() is sufficient.
  const succeededAdmission = paymentRows.find(
    (p) => p.kind === "admission" && p.status === "succeeded",
  );
  const admissionPaid = succeededAdmission
    ? {
        amountLkr: succeededAdmission.amountLkr,
        paidAt: succeededAdmission.paidAt,
      }
    : null;

  return NextResponse.json({
    outstandingLkr,
    nextPaymentDue,
    planPriceLkr: current?.planPriceLkr ?? null,
    planName: current?.planName ?? null,
    // currentEndDate powers the "did you mean Renew?" safeguard banner —
    // when the active membership ends within ~2 days OR is already past,
    // recording a payment won't extend it. The form shows a warning + a
    // direct "Open Renew instead" CTA in that case.
    currentEndDate: current?.endDate ?? null,
    lastPayment,
    admissionPaid,
  });
}
