"use server";

import { db } from "@/db";
import { profiles, plans, memberships, payments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAdminProfile } from "@/lib/auth";
import { computeMembershipWindow } from "@/lib/memberships/window";
import { validatePaymentInput } from "@/lib/payments/validate";

export type ApprovePaymentInput = {
  amountLkr: string;
  method: "cash" | "bank_transfer";
  reference: string;
  notes: string;
};

export type ApproveInput = {
  memberId: string;
  planId: string;
  approvedByProfileId: string;
  today: string;
  /** Optional: record an initial membership payment in the same transaction. */
  initialMembershipPayment?: ApprovePaymentInput;
  /** Optional: record an admission fee in the same transaction. */
  admissionFee?: ApprovePaymentInput;
};

export type ApproveResult = { ok: true } | { ok: false; error: string };

export async function _approveMemberUnsafe(input: ApproveInput): Promise<ApproveResult> {
  const [member] = await db.select().from(profiles).where(eq(profiles.id, input.memberId)).limit(1);
  if (!member) return { ok: false, error: "Member not found" };
  if (member.status === "active") return { ok: false, error: "Member is already active" };

  const [plan] = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
  if (!plan) return { ok: false, error: "Plan not found" };
  if (!plan.isActive) return { ok: false, error: "Plan is disabled" };

  // Validate any optional payments BEFORE opening the transaction so we never
  // create a half-rolled-back state for bad input.
  if (input.initialMembershipPayment) {
    const v = validatePaymentInput({
      amountLkr: input.initialMembershipPayment.amountLkr,
      method: input.initialMembershipPayment.method,
      kind: "membership",
      reference: input.initialMembershipPayment.reference,
      notes: input.initialMembershipPayment.notes,
    });
    if (!v.ok) return { ok: false, error: "Membership payment is invalid" };
  }
  if (input.admissionFee) {
    const v = validatePaymentInput({
      amountLkr: input.admissionFee.amountLkr,
      method: input.admissionFee.method,
      kind: "admission",
      reference: input.admissionFee.reference,
      notes: input.admissionFee.notes,
    });
    if (!v.ok) return { ok: false, error: "Admission fee is invalid" };
  }

  const window = computeMembershipWindow({
    today: input.today,
    durationDays: plan.durationDays,
  });

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(memberships)
        .values({
          memberId: input.memberId,
          planId: input.planId,
          startDate: window.startDate,
          endDate: window.endDate,
          status: "active",
          createdBy: input.approvedByProfileId,
        })
        .returning({ id: memberships.id });

      await tx
        .update(profiles)
        .set({ status: "active" })
        .where(eq(profiles.id, input.memberId));

      if (input.initialMembershipPayment) {
        const v = validatePaymentInput({
          amountLkr: input.initialMembershipPayment.amountLkr,
          method: input.initialMembershipPayment.method,
          kind: "membership",
          reference: input.initialMembershipPayment.reference,
          notes: input.initialMembershipPayment.notes,
        });
        if (v.ok) {
          await tx.insert(payments).values({
            memberId: input.memberId,
            membershipId: created.id,
            amountLkr: v.value.amountLkr,
            method: v.value.method,
            kind: "membership",
            status: "succeeded",
            reference: v.value.reference,
            notes: v.value.notes,
            recordedBy: input.approvedByProfileId,
          });
        }
      }

      if (input.admissionFee) {
        const v = validatePaymentInput({
          amountLkr: input.admissionFee.amountLkr,
          method: input.admissionFee.method,
          kind: "admission",
          reference: input.admissionFee.reference,
          notes: input.admissionFee.notes,
        });
        if (v.ok) {
          await tx.insert(payments).values({
            memberId: input.memberId,
            membershipId: null,
            amountLkr: v.value.amountLkr,
            method: v.value.method,
            kind: "admission",
            status: "succeeded",
            reference: v.value.reference,
            notes: v.value.notes,
            recordedBy: input.approvedByProfileId,
          });
        }
      }
    });
  } catch {
    return { ok: false, error: "Approval transaction failed" };
  }

  return { ok: true };
}

/**
 * Server-action wrapper called from the pending-approvals UI.
 * Calls requireAdminProfile() and mirrors status to Clerk publicMetadata.
 */
export async function approveMember(
  _prev: ApproveResult | undefined,
  formData: FormData,
): Promise<ApproveResult> {
  const admin = await requireAdminProfile();
  const memberId = String(formData.get("memberId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  if (!memberId || !planId) return { ok: false, error: "memberId and planId required" };

  const includeAdmission = formData.get("includeAdmission") === "on";
  const includeFirstPayment = formData.get("includeFirstPayment") === "on";

  const today = (await import("@/lib/tz")).todayInSL();
  const result = await _approveMemberUnsafe({
    memberId,
    planId,
    approvedByProfileId: admin.id,
    today,
    admissionFee: includeAdmission
      ? {
          amountLkr: String(formData.get("admissionAmount") ?? ""),
          method: String(formData.get("admissionMethod") ?? "cash") as
            | "cash"
            | "bank_transfer",
          reference: "",
          notes: "",
        }
      : undefined,
    initialMembershipPayment: includeFirstPayment
      ? {
          amountLkr: String(formData.get("paymentAmount") ?? ""),
          method: String(formData.get("paymentMethod") ?? "cash") as
            | "cash"
            | "bank_transfer",
          reference: "",
          notes: "",
        }
      : undefined,
  });

  if (result.ok) {
    const [member] = await db.select().from(profiles).where(eq(profiles.id, memberId)).limit(1);
    if (member) {
      const client = await clerkClient();
      await client.users.updateUserMetadata(member.clerkUserId, {
        publicMetadata: { role: member.role, status: "active" },
      });
    }
    revalidatePath("/admin/pending");
    revalidatePath("/admin/members");
    revalidatePath(`/admin/members/${memberId}`);
    revalidatePath("/admin/reports");
  }

  return result;
}
