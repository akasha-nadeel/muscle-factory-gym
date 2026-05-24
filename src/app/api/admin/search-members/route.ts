import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdmin } from "@/lib/auth";
import {
  countCyclesElapsed,
  inferCyclePeriod,
} from "@/lib/payments/next-due";
import { todayInSL } from "@/lib/tz";

type RawRow = {
  id: string;
  full_name: string;
  email: string | null;
  gym_id: number | null;
  photo_url: string | null;
  active_membership_id: string | null;
  active_plan_name: string | null;
  active_plan_price_lkr: string | null;
  active_start_date: string | null;
  paid_lkr: string | null;
};

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  // activeOnly is the dashboard payment modal's mode: returns the full list
  // when q is empty, includes cycle-aware outstanding per row, and only
  // surfaces members who can transact.
  const activeOnly = url.searchParams.get("activeOnly") === "true";

  if (q.length < 2 && !activeOnly) {
    return NextResponse.json({ results: [] });
  }

  const today = todayInSL();
  const limit = q.length >= 2 ? 8 : 500;
  const pattern = q.length >= 2 ? `%${q}%` : null;
  const numeric = pattern && /^\d+$/.test(q) ? Number(q) : null;

  // Compose the WHERE conditions for the outer profiles row.
  const conds: ReturnType<typeof sql>[] = [
    sql`p.role = 'member'`,
    sql`p.clerk_user_id NOT LIKE 'removed:%'`,
  ];
  if (activeOnly) conds.push(sql`p.status = 'active'`);
  if (pattern) {
    const ors: ReturnType<typeof sql>[] = [
      sql`p.full_name ILIKE ${pattern}`,
      sql`p.email ILIKE ${pattern}`,
    ];
    if (numeric !== null) ors.push(sql`p.gym_id = ${numeric}`);
    conds.push(sql`(${sql.join(ors, sql` OR `)})`);
  }
  const where = sql.join(conds, sql` AND `);

  // LATERAL joins pull each profile's current membership + paid total in
  // one pass. Cycle-aware outstanding is computed in JS below (calendar
  // arithmetic like `addMonths` doesn't translate cleanly to SQL).
  const result = await db.execute(sql`
    SELECT
      p.id,
      p.full_name,
      p.email,
      p.gym_id,
      p.photo_url,
      cm.membership_id      AS active_membership_id,
      cm.plan_name          AS active_plan_name,
      cm.price_lkr::text    AS active_plan_price_lkr,
      cm.start_date::text   AS active_start_date,
      COALESCE(pa.paid, 0)::text AS paid_lkr
    FROM profiles p
    LEFT JOIN LATERAL (
      SELECT m.id AS membership_id,
             m.start_date,
             pl.name AS plan_name,
             pl.price_lkr
      FROM memberships m
      INNER JOIN plans pl ON pl.id = m.plan_id
      WHERE m.member_id = p.id
        AND m.status = 'active'
        AND m.end_date >= ${today}::date
      ORDER BY m.end_date DESC
      LIMIT 1
    ) cm ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(amount_lkr), 0) AS paid
      FROM payments
      WHERE membership_id = cm.membership_id
        AND kind = 'membership'
        AND status IN ('succeeded', 'refunded')
    ) pa ON cm.membership_id IS NOT NULL
    WHERE ${where}
    ORDER BY p.full_name ASC
    LIMIT ${limit}
  `);

  const rawRows =
    (result as unknown as { rows?: RawRow[] }).rows ??
    (result as unknown as RawRow[]);
  const rows = Array.isArray(rawRows) ? rawRows : [];

  const results = rows.map((r) => {
    let outstandingLkr: string | null = null;
    if (
      r.active_membership_id &&
      r.active_plan_price_lkr !== null &&
      r.active_start_date !== null &&
      r.active_plan_name !== null
    ) {
      const cyclePeriod = inferCyclePeriod(r.active_plan_name);
      const cycles = Math.max(
        1,
        countCyclesElapsed({
          membershipStart: r.active_start_date,
          cyclePeriod,
          today,
        }),
      );
      const expected = Number(r.active_plan_price_lkr) * cycles;
      const paid = Number(r.paid_lkr ?? 0);
      outstandingLkr = Math.max(0, expected - paid).toFixed(2);
    }
    return {
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      gymId: r.gym_id,
      photoUrl: r.photo_url,
      activeMembershipId: r.active_membership_id,
      activePlanName: r.active_plan_name,
      outstandingLkr,
    };
  });

  return NextResponse.json({ results });
}
