import { eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { workoutPlans } from "@/db/schema";
import { deleteWorkoutPlan } from "@/lib/storage/supabase-storage";

export type ExpireWorkoutPlansSummary = {
  deleted: number;
  storageErrors: number;
};

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * Delete workout plan PDFs that have lived in storage for more than 5 days.
 *
 * Why a hard expiry: keeps the Supabase free-tier 1 GB storage budget tight
 * even as the gym grows. Members get a 5-day window to download; after that
 * the trainer re-uploads if needed.
 *
 * Per expired row:
 *   1. Delete the Storage object (best-effort; orphan files in a private
 *      bucket are tolerable, orphan DB rows are not).
 *   2. Delete the DB row.
 *
 * Idempotent: re-running finds nothing because the previous run cleared it.
 */
export async function _expireWorkoutPlansUnsafe(input: {
  now: Date;
}): Promise<ExpireWorkoutPlansSummary> {
  const cutoff = new Date(input.now.getTime() - FIVE_DAYS_MS);

  const expired = await db
    .select({
      id: workoutPlans.id,
      storagePath: workoutPlans.storagePath,
    })
    .from(workoutPlans)
    .where(lt(workoutPlans.createdAt, cutoff));

  let deleted = 0;
  let storageErrors = 0;

  for (const row of expired) {
    try {
      await deleteWorkoutPlan(row.storagePath);
    } catch (err) {
      storageErrors += 1;
      console.error(
        "[expire-workout-plans] storage delete failed",
        row.id,
        err,
      );
      // Continue — drop the DB row anyway so the member's portal stops
      // pointing at a file that may or may not still exist.
    }
    await db.delete(workoutPlans).where(eq(workoutPlans.id, row.id));
    deleted += 1;
  }

  return { deleted, storageErrors };
}
