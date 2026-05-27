"use server";

import { db } from "@/db";
import { payments, profiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminProfile } from "@/lib/auth";
import {
  validatePaymentInput,
  type PaymentInput,
  type PaymentKind,
  type PaymentMethod,
} from "@/lib/payments/validate";
import { isWiped } from "@/lib/profiles/wiped";

const WIPED_ACTION_ERROR =
  "This member has been removed. Financial history is retained but no new actions can be taken.";

export type RecordPaymentInput = {
  memberId: string;
  membershipId: string | null;
  recordedByProfileId: string;
} & PaymentInput;

export type PaymentActionResult =
  | { ok: true; paymentId?: string }
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

  if (v.value.kind === "admission") {
    const [existingAdmission] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.memberId, input.memberId),
          eq(payments.kind, "admission"),
          eq(payments.status, "succeeded"),
        ),
      )
      .limit(1);
    if (existingAdmission) {
      return {
        ok: false,
        error:
          "Joining fee has already been recorded for this member. If the existing record is wrong, refund it for your books and contact support to remove it.",
      };
    }
  }

  const [inserted] = await db
    .insert(payments)
    .values({
      memberId: input.memberId,
      membershipId: input.membershipId,
      amountLkr: v.value.amountLkr,
      method: v.value.method,
      kind: v.value.kind,
      status: "succeeded",
      reference: v.value.reference,
      notes: v.value.notes,
      recordedBy: input.recordedByProfileId,
    })
    .returning({ id: payments.id });
  return { ok: true, paymentId: inserted.id };
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
  // Cash payments often have no reference, so fall back to the original
  // payment's UUID so every refund row carries a unique link to its origin.
  // Use `||` (not `??`) to also catch empty strings that may bypass validation
  // (e.g. direct DB inserts in tests, or future code paths).
  const refKey = orig.reference || orig.id;
  const existing = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.reference, refKey),
        eq(payments.status, "refunded"),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return { ok: false, error: "This payment has already been refunded" };
  }

  const negative = (-Number(orig.amountLkr)).toFixed(2);
  await db.insert(payments).values({
    memberId: orig.memberId,
    membershipId: orig.membershipId,
    amountLkr: negative,
    method: orig.method,
    kind: orig.kind,
    status: "refunded",
    reference: refKey, // links the refund back to the original (uses orig.id when no reference)
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

  const [member] = await db
    .select({ clerkUserId: profiles.clerkUserId })
    .from(profiles)
    .where(eq(profiles.id, bound.memberId))
    .limit(1);
  if (!member) return { ok: false, error: "Member not found" };
  if (isWiped(member)) return { ok: false, error: WIPED_ACTION_ERROR };

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
    revalidatePath("/admin");
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
    revalidatePath("/admin");
    revalidatePath("/admin/members");
    revalidatePath("/admin/reports");
    revalidatePath("/portal");
  }
  return result;
}

// -------------------- Undo (within 5 min of recording) -------------------

const UNDO_WINDOW_MS = 5 * 60 * 1000;

/**
 * Hard-delete a just-recorded payment, used as the "Undo" action on the
 * Record Payment success toast. Unlike a refund, this removes the row
 * outright — cleaner for what is genuinely a 10-second click correction,
 * not an accounting event. Gated to a 5-minute window so it can't be used
 * to retroactively rewrite history.
 *
 * Outside the window the admin uses the regular Refund flow.
 */
export async function undoRecentPayment(
  paymentId: string,
): Promise<PaymentActionResult> {
  await requireAdminProfile();
  const [row] = await db
    .select({
      id: payments.id,
      createdAt: payments.createdAt,
      status: payments.status,
    })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  if (!row) return { ok: false, error: "Payment not found" };
  if (row.status !== "succeeded") {
    return {
      ok: false,
      error: "Only freshly-recorded payments can be undone. Use Refund instead.",
    };
  }
  const ageMs = Date.now() - row.createdAt.getTime();
  if (ageMs > UNDO_WINDOW_MS) {
    return {
      ok: false,
      error: "Undo window has expired. Use the Refund button on the payment row instead.",
    };
  }
  await db.delete(payments).where(eq(payments.id, paymentId));
  revalidatePath("/admin");
  revalidatePath("/admin/members");
  revalidatePath("/admin/reports");
  revalidatePath("/portal");
  return { ok: true };
}
