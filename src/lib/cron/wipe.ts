import { db } from "@/db";
import { memberships, profiles, workoutPlans } from "@/db/schema";
import { WIPED_FULL_NAME } from "@/lib/profiles/wiped";
import { deleteWorkoutPlan } from "@/lib/storage/supabase-storage";
import { and, eq, sql } from "drizzle-orm";

export type WipeSummary = { wiped: number; storageErrors: number };

/**
 * Wipe every `profiles` row that satisfies all of:
 *   - role = 'member'         (admins are never wiped)
 *   - clerk_user_id NOT LIKE 'removed:%'  (idempotent — skips already-wiped)
 *   - MAX(last_checkin, created_at)::date < $todaySL::date - 180 days
 *
 * Status is intentionally NOT filtered — this also picks up rows the older
 * `inactivate` cron left at status='inactive'.
 *
 * For each stale profile:
 *   1. Delete the workout-plan PDF from Supabase Storage (best-effort; an
 *      orphaned file is tolerable, an orphaned DB row is not).
 *   2. In a per-profile transaction: drop workout_plans row, cancel any
 *      lingering active membership, and null out the profile's PII while
 *      severing its Clerk link via a `removed:<uuid>` sentinel.
 *
 * Payment/attendance/membership history is preserved for the gym's books.
 */
export async function _wipeStaleMembersUnsafe(input: {
  todaySL: string;
}): Promise<WipeSummary> {
  const staleResult = await db.execute(sql`
    SELECT p.id
    FROM profiles p
    LEFT JOIN attendance a ON a.member_id = p.id
    WHERE p.role = 'member'
      AND p.clerk_user_id NOT LIKE 'removed:%'
    GROUP BY p.id
    HAVING GREATEST(
      COALESCE(MAX(a.checked_in_at)::date, DATE '1900-01-01'),
      p.created_at::date
    ) < (${input.todaySL}::date - INTERVAL '180 days')
  `);

  // postgres-js returns rows either as an array directly or wrapped in
  // { rows: [] } depending on driver version. Handle both.
  const rawRows =
    (staleResult as unknown as { rows?: unknown[] }).rows ??
    (staleResult as unknown as unknown[]);
  const staleIds = (Array.isArray(rawRows) ? rawRows : [])
    .map((r) => (r as { id?: string }).id)
    .filter((id): id is string => typeof id === "string");

  let wiped = 0;
  let storageErrors = 0;

  for (const id of staleIds) {
    // 1) Storage cleanup OUTSIDE the DB transaction so a Storage outage
    //    can't block the PII wipe.
    const planRows = await db
      .select()
      .from(workoutPlans)
      .where(eq(workoutPlans.memberId, id));
    const plan = planRows[0];
    if (plan) {
      try {
        await deleteWorkoutPlan(plan.storagePath);
      } catch (err) {
        storageErrors += 1;
        console.error("[wipe] storage delete failed", id, err);
        // continue — drop the DB row anyway.
      }
    }

    // 2) Per-profile DB transaction.
    await db.transaction(async (tx) => {
      await tx.delete(workoutPlans).where(eq(workoutPlans.memberId, id));

      await tx
        .update(memberships)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(memberships.memberId, id),
            eq(memberships.status, "active"),
          ),
        );

      await tx
        .update(profiles)
        .set({
          fullName: WIPED_FULL_NAME,
          email: null,
          phone: null,
          photoUrl: null,
          gymId: null,
          pendingQrScanAt: null,
          // Literal 'removed:' must be inlined into the SQL (not parametrized)
          // so we use the same idiom as `notWipedClause` in profiles/wiped.ts.
          clerkUserId: sql`'removed:' || ${profiles.id}::text`,
          status: "inactive",
          updatedAt: sql`now()`,
        })
        .where(eq(profiles.id, id));
    });

    wiped += 1;
  }

  return { wiped, storageErrors };
}
