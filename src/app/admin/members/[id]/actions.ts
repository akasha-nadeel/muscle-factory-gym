"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { addDays, format, parseISO } from "date-fns";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminProfile } from "@/lib/auth";
import { db } from "@/db";
import {
  profiles,
  memberships,
  plans,
  payments,
  attendance,
  workoutPlans,
} from "@/db/schema";
import { computeMembershipWindow } from "@/lib/memberships/window";
import { validatePaymentInput } from "@/lib/payments/validate";
import { todayInSL } from "@/lib/tz";
import { deleteWorkoutPlan } from "@/lib/storage/supabase-storage";
import { isWiped } from "@/lib/profiles/wiped";
import { displayName } from "@/lib/profiles/display-name";

const WIPED_ACTION_ERROR =
  "This member has been removed. Financial history is retained but no new actions can be taken.";

export type DeleteMemberResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Hard-delete a member: nukes Clerk user, profile, and all child rows
 * (workout plan, attendance, payments, memberships). Best-effort steps
 * (Storage file + Clerk delete) swallow their errors after the DB has
 * already committed — leaving an orphaned Clerk row is recoverable;
 * leaving an orphaned profile is not.
 *
 * The admin running this must have the "admin" role. The action takes
 * the typed member name and must match exactly before touching anything.
 */
export async function deleteMemberAction(
  memberId: string,
  typedName: string,
): Promise<DeleteMemberResult> {
  await requireAdminProfile();

  const [member] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, memberId))
    .limit(1);
  if (!member) return { ok: false, error: "Member not found" };

  if (isWiped(member)) return { ok: false, error: WIPED_ACTION_ERROR };

  // Compare against the displayed name (with the @domain stripped for
  // email-as-fallback names). The admin types what they see, not the raw
  // DB value.
  if (typedName.trim() !== displayName(member.fullName)) {
    return { ok: false, error: "Typed name does not match member's name" };
  }

  if (member.role === "admin") {
    return { ok: false, error: "Cannot delete an admin account" };
  }

  // Capture the workout plan file path (if any) BEFORE the cascade
  // delete removes the DB row, so we still know what to remove from
  // Supabase Storage.
  const [planRow] = await db
    .select({ storagePath: workoutPlans.storagePath })
    .from(workoutPlans)
    .where(eq(workoutPlans.memberId, memberId))
    .limit(1);

  // Order matters: dependent rows with onDelete:"restrict" must go
  // first. workout_plans cascades on profile delete already.
  await db.delete(attendance).where(eq(attendance.memberId, memberId));
  await db.delete(payments).where(eq(payments.memberId, memberId));
  await db.delete(memberships).where(eq(memberships.memberId, memberId));
  await db.delete(profiles).where(eq(profiles.id, memberId));

  if (planRow) {
    await deleteWorkoutPlan(planRow.storagePath).catch((err) =>
      console.warn(
        `[delete-member] failed to remove workout plan file ${planRow.storagePath}: ${String(err)}`,
      ),
    );
  }

  try {
    const client = await clerkClient();
    await client.users.deleteUser(member.clerkUserId);
  } catch (err) {
    console.warn(
      `[delete-member] failed to delete Clerk user ${member.clerkUserId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  revalidatePath("/admin/members");
  revalidatePath("/admin");
  return { ok: true };
}

// -------------------- Renew membership -----------------------------------

export type RenewPaymentInput = {
  amountLkr: string;
  method: "cash" | "bank_transfer";
  reference: string;
  notes: string;
};

export type RenewInput = {
  memberId: string;
  planId: string;
  renewedByProfileId: string;
  today: string; // YYYY-MM-DD in SL
  /** Optional: record the renewal payment in the same transaction. */
  payment?: RenewPaymentInput;
};

export type RenewResult = { ok: true } | { ok: false; error: string };

/**
 * Create a new membership row for a returning member.
 *
 * Policy (decided at design time):
 *  - One row per renewal — never extend an existing row's end_date.
 *  - New row starts the day after the latest existing membership's
 *    end_date, OR today if that would be in the past (member let their
 *    plan lapse before paying again).
 *  - Optional payment is attached to the NEW membership in the same tx.
 *
 * Allowed when the profile is active and not wiped. Does not gate on
 * whether the current membership is expired — admin may renew early
 * within the last week of the cycle, in which case the new membership
 * sits back-to-back with the current one and takes over on its first day.
 */
export async function _renewMembershipUnsafe(
  input: RenewInput,
): Promise<RenewResult> {
  const [member] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, input.memberId))
    .limit(1);
  if (!member) return { ok: false, error: "Member not found" };
  if (isWiped(member)) return { ok: false, error: WIPED_ACTION_ERROR };
  if (member.status !== "active") {
    return { ok: false, error: "Member must be active to renew" };
  }

  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, input.planId))
    .limit(1);
  if (!plan) return { ok: false, error: "Plan not found" };
  if (!plan.isActive) return { ok: false, error: "Plan is disabled" };

  if (input.payment) {
    const v = validatePaymentInput({
      amountLkr: input.payment.amountLkr,
      method: input.payment.method,
      kind: "membership",
      reference: input.payment.reference,
      notes: input.payment.notes,
    });
    if (!v.ok) return { ok: false, error: "Renewal payment is invalid" };
  }

  // Latest end date across all past memberships for this member.
  // computeMembershipWindow's `startOn` is clamped to >= today, so a
  // long-expired end_date naturally falls back to today (gap renewal).
  const [latest] = await db
    .select({ endDate: memberships.endDate })
    .from(memberships)
    .where(eq(memberships.memberId, input.memberId))
    .orderBy(desc(memberships.endDate))
    .limit(1);

  const startOn = latest
    ? format(addDays(parseISO(latest.endDate), 1), "yyyy-MM-dd")
    : undefined;

  const window = computeMembershipWindow({
    today: input.today,
    durationDays: plan.durationDays,
    startOn,
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
          createdBy: input.renewedByProfileId,
        })
        .returning({ id: memberships.id });

      if (input.payment) {
        const v = validatePaymentInput({
          amountLkr: input.payment.amountLkr,
          method: input.payment.method,
          kind: "membership",
          reference: input.payment.reference,
          notes: input.payment.notes,
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
            recordedBy: input.renewedByProfileId,
          });
        }
      }
    });
  } catch {
    return { ok: false, error: "Renewal transaction failed" };
  }

  return { ok: true };
}

/**
 * Gated wrapper for the renew action — called from the client dialog form.
 * `bound` carries memberId so the form's <input name="planId"> + payment
 * fields can be the only thing the dialog binds at runtime.
 */
export async function renewMembership(
  memberId: string,
  _prev: RenewResult | undefined,
  formData: FormData,
): Promise<RenewResult> {
  const admin = await requireAdminProfile();

  const planId = String(formData.get("planId") ?? "");
  const includePayment =
    String(formData.get("includePayment") ?? "") === "on";
  const payment: RenewPaymentInput | undefined = includePayment
    ? {
        amountLkr: String(formData.get("paymentAmount") ?? ""),
        method: (String(formData.get("paymentMethod") ?? "cash") ===
        "bank_transfer"
          ? "bank_transfer"
          : "cash") as "cash" | "bank_transfer",
        reference: String(formData.get("paymentReference") ?? ""),
        notes: String(formData.get("paymentNotes") ?? ""),
      }
    : undefined;

  const result = await _renewMembershipUnsafe({
    memberId,
    planId,
    renewedByProfileId: admin.id,
    today: todayInSL(),
    payment,
  });

  if (result.ok) {
    revalidatePath("/admin");
    revalidatePath(`/admin/members/${memberId}`);
    revalidatePath("/portal");
  }
  return result;
}
