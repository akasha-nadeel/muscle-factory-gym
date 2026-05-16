import { db } from "@/db";
import { profiles, payments, attendance } from "@/db/schema";
import { and, eq, gte, lt, desc, sql } from "drizzle-orm";
import { requireAdminProfile } from "@/lib/auth";
import { Wallet, Users, UserPlus, AlertCircle } from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
import { StatCard } from "@/components/admin/stat-card";
import {
  RecentPaymentsPanel,
  type RecentPayment,
} from "@/components/admin/recent-payments-panel";
import {
  RecentCheckinsPanel,
  type RecentCheckin,
} from "@/components/admin/recent-checkins-panel";
import { todayInSL } from "@/lib/tz";

function startOfMonthSL(todaySL: string): string {
  return `${todaySL.slice(0, 7)}-01`;
}
function startOfNextMonthSL(todaySL: string): string {
  const [y, m] = todaySL.split("-").map(Number);
  if (m === 12) return `${y + 1}-01-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

export default async function AdminHome() {
  const admin = await requireAdminProfile();
  const today = todayInSL();
  const monthStart = startOfMonthSL(today);
  const monthEnd = startOfNextMonthSL(today);

  // Total outstanding across active members in ONE SQL pass:
  //   - pick each active member's latest active+unexpired membership (CTE 1)
  //   - sum membership-kind payments per membership (CTE 2)
  //   - return sum of GREATEST(plan_price - paid, 0) across all rows
  // Mirrors computeOutstanding()'s semantics: refunds (negative amounts) are
  // included via SUM, and the per-member result is clamped at 0.
  const outstandingQuery = db.execute(sql`
    WITH current_memberships AS (
      SELECT DISTINCT ON (m.member_id)
        m.id AS membership_id,
        pl.price_lkr
      FROM memberships m
      INNER JOIN plans pl ON pl.id = m.plan_id
      INNER JOIN profiles pr ON pr.id = m.member_id
      WHERE m.status = 'active'
        AND m.end_date >= ${today}::date
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
    SELECT COALESCE(SUM(GREATEST(
      cm.price_lkr::numeric - COALESCE(pa.total_paid, 0),
      0
    )), 0)::text AS total
    FROM current_memberships cm
    LEFT JOIN paid_amounts pa ON pa.membership_id = cm.membership_id
  `);

  const [
    revenueRow,
    activeRow,
    pendingRow,
    outstandingRawResult,
    paymentsRaw,
    checkinsRaw,
  ] = await Promise.all([
    db
      .select({ total: sql<string | null>`sum(${payments.amountLkr})` })
      .from(payments)
      .where(
        and(
          eq(payments.status, "succeeded"),
          gte(payments.paidAt, new Date(`${monthStart}T00:00:00Z`)),
          lt(payments.paidAt, new Date(`${monthEnd}T00:00:00Z`)),
        ),
      ),
    db
      .select({ count: sql<string>`count(*)` })
      .from(profiles)
      .where(and(eq(profiles.role, "member"), eq(profiles.status, "active"))),
    db
      .select({ count: sql<string>`count(*)` })
      .from(profiles)
      .where(eq(profiles.status, "pending")),
    outstandingQuery,
    db
      .select({
        id: payments.id,
        memberId: payments.memberId,
        memberName: profiles.fullName,
        amountLkr: payments.amountLkr,
        method: payments.method,
        status: payments.status,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .innerJoin(profiles, eq(profiles.id, payments.memberId))
      .where(eq(payments.status, "succeeded"))
      .orderBy(desc(payments.paidAt))
      .limit(10),
    db
      .select({
        id: attendance.id,
        memberId: attendance.memberId,
        memberName: profiles.fullName,
        gymId: profiles.gymId,
        checkedInAt: attendance.checkedInAt,
        source: attendance.source,
      })
      .from(attendance)
      .innerJoin(profiles, eq(profiles.id, attendance.memberId))
      .orderBy(desc(attendance.checkedInAt))
      .limit(10),
  ]);

  const revenue = Number(revenueRow[0]?.total ?? 0);
  const activeCount = Number(activeRow[0]?.count ?? 0);
  const pendingCount = Number(pendingRow[0]?.count ?? 0);

  // postgres-js returns either an array or { rows: [] } depending on driver
  // version. Handle both (same pattern as Phase 5/6).
  const outstandingRows =
    (outstandingRawResult as unknown as { rows?: Array<{ total: string }> })
      .rows ?? (outstandingRawResult as unknown as Array<{ total: string }>);
  const outstandingTotal = Number(outstandingRows?.[0]?.total ?? 0);

  return (
    <AdminPage breadcrumbs={[{ label: "Dashboard" }]}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Welcome, {admin.fullName}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Here&apos;s what&apos;s happening at the gym today.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Wallet}
            label="Total revenue"
            value={`LKR ${revenue.toLocaleString()}`}
            caption="This month"
            accentColor="red"
          />
          <StatCard
            icon={Users}
            label="Active members"
            value={activeCount}
            caption="Current"
            accentColor="green"
          />
          <StatCard
            icon={UserPlus}
            label="Pending approvals"
            value={pendingCount}
            caption={pendingCount === 0 ? "All caught up" : "Needs review"}
            accentColor="amber"
          />
          <StatCard
            icon={AlertCircle}
            label="Outstanding dues"
            value={`LKR ${outstandingTotal.toLocaleString()}`}
            caption="Across active members"
            accentColor="red"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RecentPaymentsPanel rows={paymentsRaw as RecentPayment[]} />
          <RecentCheckinsPanel rows={checkinsRaw as RecentCheckin[]} />
        </div>
      </div>
    </AdminPage>
  );
}
