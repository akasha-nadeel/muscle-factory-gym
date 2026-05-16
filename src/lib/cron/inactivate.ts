import { db } from "@/db";
import { sql } from "drizzle-orm";

export type InactivateSummary = { flipped: number };

/**
 * Flip every `profiles` row that satisfies all of:
 *   - status = 'active'
 *   - role = 'member'      (admins are never inactivated)
 *   - MAX(last_checkin, created_at)::date < $todaySL::date - 180 days
 *
 * `MAX(last_checkin)` falls back to '1900-01-01' for members with zero
 * attendance rows, so the effective last-activity date is the profile's
 * `created_at` for never-checked-in members.
 *
 * Soft-only: profile row stays, status flips. Attendance, memberships,
 * payments are all preserved.
 */
export async function _inactivateStaleMembersUnsafe(input: {
  todaySL: string;
}): Promise<InactivateSummary> {
  const result = await db.execute(sql`
    WITH stale AS (
      SELECT p.id
      FROM profiles p
      LEFT JOIN attendance a ON a.member_id = p.id
      WHERE p.status = 'active'
        AND p.role = 'member'
      GROUP BY p.id
      HAVING GREATEST(
        COALESCE(MAX(a.checked_in_at)::date, DATE '1900-01-01'),
        p.created_at::date
      ) < (${input.todaySL}::date - INTERVAL '180 days')
    )
    UPDATE profiles
    SET status = 'inactive'
    WHERE id IN (SELECT id FROM stale)
    RETURNING id
  `);

  // postgres-js returns rows either as an array directly or wrapped in
  // { rows: [] } depending on driver version. Handle both.
  const rows =
    (result as unknown as { rows?: unknown[] }).rows ??
    (result as unknown as unknown[]);
  const flipped = Array.isArray(rows) ? rows.length : 0;
  return { flipped };
}
