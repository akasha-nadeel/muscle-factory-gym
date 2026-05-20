"use server";

import { requireAdminProfile } from "@/lib/auth";
import { db } from "@/db";
import { workoutPlans, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  uploadWorkoutPlan,
  deleteWorkoutPlan,
} from "@/lib/storage/supabase-storage";
import { sendWorkoutPlanEmail } from "@/lib/email/send-workout-plan";
import { validateWorkoutPlanFile } from "@/lib/workout-plans/validate";

export type WorkoutPlanResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Admin uploads a workout plan PDF for a specific member.
 * Latest-only — uploading replaces any existing plan for the same member.
 *
 * Best-effort steps (delete previous file, send email) swallow their own
 * errors so the upload always commits cleanly when validation passes.
 */
export async function uploadWorkoutPlanAction(
  memberId: string,
  _prev: WorkoutPlanResult | undefined,
  formData: FormData,
): Promise<WorkoutPlanResult> {
  const admin = await requireAdminProfile();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file selected" };
  }
  const v = validateWorkoutPlanFile({ type: file.type, size: file.size });
  if (!v.ok) return v;

  const [member] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, memberId))
    .limit(1);
  if (!member) return { ok: false, error: "Member not found" };

  const buffer = await file.arrayBuffer();

  // Capture the prior row so we can delete its file AFTER the upsert
  // succeeds. If we deleted first and the upload failed, the member would
  // lose their existing plan with no replacement.
  const [existing] = await db
    .select()
    .from(workoutPlans)
    .where(eq(workoutPlans.memberId, memberId))
    .limit(1);

  const { storagePath } = await uploadWorkoutPlan({
    memberId,
    fileName: file.name,
    buffer,
    contentType: file.type,
  });

  await db
    .insert(workoutPlans)
    .values({
      memberId,
      fileName: file.name,
      storagePath,
      fileSizeBytes: file.size,
      uploadedBy: admin.id,
    })
    .onConflictDoUpdate({
      target: workoutPlans.memberId,
      set: {
        fileName: file.name,
        storagePath,
        fileSizeBytes: file.size,
        uploadedBy: admin.id,
        createdAt: new Date(),
      },
    });

  if (existing && existing.storagePath !== storagePath) {
    await deleteWorkoutPlan(existing.storagePath).catch((err) =>
      console.warn(
        `[workout-plans] failed to delete previous file ${existing.storagePath}: ${String(err)}`,
      ),
    );
  }

  await sendWorkoutPlanEmail({
    toEmail: member.email,
    memberName: member.fullName,
    fileName: file.name,
  });

  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/portal");
  return { ok: true };
}

export async function deleteWorkoutPlanAction(
  memberId: string,
): Promise<WorkoutPlanResult> {
  await requireAdminProfile();
  const [existing] = await db
    .select()
    .from(workoutPlans)
    .where(eq(workoutPlans.memberId, memberId))
    .limit(1);
  if (!existing) return { ok: true };
  await db.delete(workoutPlans).where(eq(workoutPlans.memberId, memberId));
  await deleteWorkoutPlan(existing.storagePath).catch((err) =>
    console.warn(
      `[workout-plans] failed to delete file ${existing.storagePath}: ${String(err)}`,
    ),
  );
  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/portal");
  return { ok: true };
}
