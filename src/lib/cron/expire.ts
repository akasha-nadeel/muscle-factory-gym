import { db } from "@/db";
import { memberships } from "@/db/schema";
import { and, eq, lt } from "drizzle-orm";

export type ExpireSummary = { flipped: number };

/**
 * Flip every membership whose `end_date` is strictly before `todaySL`
 * AND whose status is still `active`, to `status='expired'`.
 *
 * Single-statement UPDATE. Naturally idempotent on re-run — once a row
 * is `expired` it no longer satisfies `status='active'`.
 */
export async function _expireStaleMembershipsUnsafe(input: {
  todaySL: string;
}): Promise<ExpireSummary> {
  const flipped = await db
    .update(memberships)
    .set({ status: "expired" })
    .where(
      and(
        eq(memberships.status, "active"),
        lt(memberships.endDate, input.todaySL),
      ),
    )
    .returning({ id: memberships.id });
  return { flipped: flipped.length };
}
