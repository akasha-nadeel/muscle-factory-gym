"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminProfile } from "@/lib/auth";
import { db } from "@/db";
import {
  profiles,
  memberships,
  payments,
  attendance,
  workoutPlans,
} from "@/db/schema";
import { deleteWorkoutPlan } from "@/lib/storage/supabase-storage";

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

  if (typedName.trim() !== member.fullName) {
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
