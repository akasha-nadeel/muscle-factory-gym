import { sql } from "drizzle-orm";
import { db } from "@/db";

export type OutstandingRow = {
  memberId: string;
  fullName: string;
  gymId: number | null;
  photoUrl: string | null;
  planName: string;
  priceLkr: string;
  paidLkr: string;
  outstandingLkr: string;
  membershipEndDate: string;
};

/**
 * Per-member outstanding dues breakdown.
 *
 * Mirrors the aggregate CTE in `src/app/admin/page.tsx`: for each
 * currently-active member, take their latest active+unexpired membership and
 * compute `plan_price - succeeded+refunded payments`. Rows with no
 * outstanding are filtered out.
 *
 * Refunds are negative-amount payments that SUM correctly. computeOutstanding
 * in `src/lib/payments/outstanding.ts` has the same semantics for per-member
 * math; we keep this CTE rather than calling that helper per-member because
 * the dashboard already proved this approach scales fine to single-gym
 * volumes (one query, not N).
 */
export async function getOutstandingBreakdown(
  todaySL: string,
): Promise<OutstandingRow[]> {
  const result = await db.execute(sql`
    WITH current_memberships AS (
      SELECT DISTINCT ON (m.member_id)
        m.id          AS membership_id,
        m.member_id   AS member_id,
        m.end_date    AS membership_end_date,
        pl.id         AS plan_id,
        pl.name       AS plan_name,
        pl.price_lkr  AS price_lkr
      FROM memberships m
      INNER JOIN plans pl ON pl.id = m.plan_id
      INNER JOIN profiles pr ON pr.id = m.member_id
      WHERE m.status = 'active'
        AND m.end_date >= ${todaySL}::date
        AND pr.role = 'member'
        AND pr.status = 'active'
      ORDER BY m.member_id, m.end_date DESC
    ),
    paid_amounts AS (
      SELECT
        p.membership_id,
        SUM(p.amount_lkr) AS total_paid
      FROM payments p
      WHERE p.kind = 'membership'
        AND p.status IN ('succeeded', 'refunded')
        AND p.membership_id IS NOT NULL
      GROUP BY p.membership_id
    )
    SELECT
      pr.id                                                  AS member_id,
      pr.full_name                                           AS full_name,
      pr.gym_id                                              AS gym_id,
      pr.photo_url                                           AS photo_url,
      cm.plan_name                                           AS plan_name,
      cm.price_lkr::text                                     AS price_lkr,
      COALESCE(pa.total_paid, 0)::text                       AS paid_lkr,
      GREATEST(cm.price_lkr::numeric - COALESCE(pa.total_paid, 0), 0)::text
                                                             AS outstanding_lkr,
      cm.membership_end_date::text                           AS membership_end_date
    FROM current_memberships cm
    INNER JOIN profiles pr ON pr.id = cm.member_id
    LEFT JOIN paid_amounts pa ON pa.membership_id = cm.membership_id
    WHERE cm.price_lkr::numeric - COALESCE(pa.total_paid, 0) > 0
    ORDER BY (cm.price_lkr::numeric - COALESCE(pa.total_paid, 0)) DESC,
             pr.full_name ASC
  `);

  // postgres-js returns either an array or { rows: [] } depending on driver
  // version. Mirrors the same fallback used elsewhere (Phase 5/6).
  const rows = (
    (result as unknown as { rows?: RawRow[] }).rows ??
    (result as unknown as RawRow[])
  );

  return rows.map((r) => ({
    memberId: r.member_id,
    fullName: r.full_name,
    gymId: r.gym_id,
    photoUrl: r.photo_url,
    planName: r.plan_name,
    priceLkr: r.price_lkr,
    paidLkr: r.paid_lkr,
    outstandingLkr: r.outstanding_lkr,
    membershipEndDate: r.membership_end_date,
  }));
}

type RawRow = {
  member_id: string;
  full_name: string;
  gym_id: number | null;
  photo_url: string | null;
  plan_name: string;
  price_lkr: string;
  paid_lkr: string;
  outstanding_lkr: string;
  membership_end_date: string;
};
