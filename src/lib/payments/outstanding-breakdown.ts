import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  inferCyclePeriod,
  countCyclesElapsed,
} from "./next-due";

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
 * Per-member outstanding dues breakdown (cycle-aware).
 *
 * For each currently-active member, take their latest active+unexpired
 * membership and compute outstanding using cycle math:
 *   expected_total = cycles_elapsed * plan_price
 *   outstanding    = max(0, expected_total - paid)
 *
 * The SQL pulls raw data in one round-trip; the cycle math runs in JS
 * (calendar-aware `addMonths`/`addYears`, which SQL can't do cleanly
 * without dialect-specific date arithmetic).
 *
 * Mirrors the semantics of `computeOutstanding({ cycleContext })` in
 * `src/lib/payments/outstanding.ts` so the dashboard, admin member
 * detail, portal, and kiosk all agree on the number.
 */
export async function getOutstandingBreakdown(
  todaySL: string,
): Promise<OutstandingRow[]> {
  const result = await db.execute(sql`
    WITH current_memberships AS (
      SELECT DISTINCT ON (m.member_id)
        m.id          AS membership_id,
        m.member_id   AS member_id,
        m.start_date  AS membership_start_date,
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
      pr.id                                AS member_id,
      pr.full_name                         AS full_name,
      pr.gym_id                            AS gym_id,
      pr.photo_url                         AS photo_url,
      cm.plan_name                         AS plan_name,
      cm.price_lkr::text                   AS price_lkr,
      COALESCE(pa.total_paid, 0)::text     AS paid_lkr,
      cm.membership_start_date::text       AS membership_start_date,
      cm.membership_end_date::text         AS membership_end_date
    FROM current_memberships cm
    INNER JOIN profiles pr ON pr.id = cm.member_id
    LEFT JOIN paid_amounts pa ON pa.membership_id = cm.membership_id
    ORDER BY pr.full_name ASC
  `);

  const rows = (
    (result as unknown as { rows?: RawRow[] }).rows ??
    (result as unknown as RawRow[])
  );

  const computed: OutstandingRow[] = [];
  for (const r of rows) {
    const cyclePeriod = inferCyclePeriod(r.plan_name);
    const cyclesElapsed = Math.max(
      1,
      countCyclesElapsed({
        membershipStart: r.membership_start_date,
        cyclePeriod,
        today: todaySL,
      }),
    );
    const planPrice = Number(r.price_lkr);
    const expectedTotal = planPrice * cyclesElapsed;
    const paid = Number(r.paid_lkr);
    const outstanding = Math.max(0, expectedTotal - paid);
    if (outstanding <= 0) continue;
    computed.push({
      memberId: r.member_id,
      fullName: r.full_name,
      gymId: r.gym_id,
      photoUrl: r.photo_url,
      planName: r.plan_name,
      priceLkr: r.price_lkr,
      paidLkr: r.paid_lkr,
      outstandingLkr: outstanding.toFixed(2),
      membershipEndDate: r.membership_end_date,
    });
  }
  // Sort by outstanding desc, then name
  computed.sort((a, b) => {
    const diff = Number(b.outstandingLkr) - Number(a.outstandingLkr);
    if (diff !== 0) return diff;
    return a.fullName.localeCompare(b.fullName);
  });
  return computed;
}

type RawRow = {
  member_id: string;
  full_name: string;
  gym_id: number | null;
  photo_url: string | null;
  plan_name: string;
  price_lkr: string;
  paid_lkr: string;
  membership_start_date: string;
  membership_end_date: string;
};
