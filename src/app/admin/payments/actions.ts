"use server";

import { db } from "@/db";
import { payments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminProfile } from "@/lib/auth";
import {
  validatePaymentInput,
  type PaymentInput,
  type PaymentKind,
  type PaymentMethod,
} from "@/lib/payments/validate";

export type RecordPaymentInput = {
  memberId: string;
  membershipId: string | null;
  recordedByProfileId: string;
} & PaymentInput;

export type PaymentActionResult =
  | { ok: true }
  | { ok: false; errors?: Partial<Record<keyof PaymentInput, string>>; error?: string };

/** Test-only helper: no auth gate. */
export async function _recordPaymentUnsafe(
  input: RecordPaymentInput,
): Promise<PaymentActionResult> {
  const v = validatePaymentInput({
    amountLkr: input.amountLkr,
    method: input.method,
    kind: input.kind,
    reference: input.reference,
    notes: input.notes,
  });
  if (!v.ok) return { ok: false, errors: v.errors };

  await db.insert(payments).values({
    memberId: input.memberId,
    membershipId: input.membershipId,
    amountLkr: v.value.amountLkr,
    method: v.value.method,
    kind: v.value.kind,
    status: "succeeded",
    reference: v.value.reference,
    notes: v.value.notes,
    recordedBy: input.recordedByProfileId,
  });
  return { ok: true };
}

export type RefundInput = {
  originalPaymentId: string;
  refundedByProfileId: string;
};

/** Test-only helper: no auth gate. */
export async function _refundPaymentUnsafe(
  input: RefundInput,
): Promise<PaymentActionResult> {
  const [orig] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, input.originalPaymentId))
    .limit(1);
  if (!orig) return { ok: false, error: "Payment not found" };
  if (orig.status !== "succeeded") {
    return { ok: false, error: "Only succeeded payments can be refunded" };
  }

  // Block double-refunds: look for an existing refund row with this reference.
  if (orig.reference) {
    const existing = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.reference, orig.reference),
          eq(payments.status, "refunded"),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return { ok: false, error: "This payment has already been refunded" };
    }
  }

  const negative = (-Number(orig.amountLkr)).toFixed(2);
  await db.insert(payments).values({
    memberId: orig.memberId,
    membershipId: orig.membershipId,
    amountLkr: negative,
    method: orig.method,
    kind: orig.kind,
    status: "refunded",
    reference: orig.reference, // links the refund back to the original
    notes: `Refund of payment ${orig.id}`,
    recordedBy: input.refundedByProfileId,
  });
  return { ok: true };
}

// ---- Gated wrappers (called from forms) -------------------------------

export async function recordPayment(
  bound: { memberId: string; membershipId: string | null },
  _prev: PaymentActionResult | undefined,
  formData: FormData,
): Promise<PaymentActionResult> {
  const admin = await requireAdminProfile();
  const method = String(formData.get("method") ?? "") as PaymentMethod;
  const kind = String(formData.get("kind") ?? "") as PaymentKind;
  const raw: RecordPaymentInput = {
    memberId: bound.memberId,
    membershipId: bound.membershipId,
    recordedByProfileId: admin.id,
    amountLkr: String(formData.get("amountLkr") ?? ""),
    method,
    kind,
    reference: String(formData.get("reference") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
  const result = await _recordPaymentUnsafe(raw);
  if (result.ok) {
    revalidatePath(`/admin/members/${bound.memberId}`);
    revalidatePath("/admin/reports");
    revalidatePath("/portal");
  }
  return result;
}

export async function refundPayment(
  originalPaymentId: string,
): Promise<PaymentActionResult> {
  const admin = await requireAdminProfile();
  const result = await _refundPaymentUnsafe({
    originalPaymentId,
    refundedByProfileId: admin.id,
  });
  if (result.ok) {
    revalidatePath("/admin/members");
    revalidatePath("/admin/reports");
    revalidatePath("/portal");
  }
  return result;
}
