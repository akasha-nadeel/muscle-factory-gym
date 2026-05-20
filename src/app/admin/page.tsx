import Link from "next/link";
import { db } from "@/db";
import { profiles, payments, attendance } from "@/db/schema";
import { and, eq, gte, lt, desc, sql } from "drizzle-orm";
import { requireAdminProfile } from "@/lib/auth";
import {
  Wallet,
  Users,
  UserPlus,
  AlertCircle,
  Tag,
  Search,
} from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
import { StatCard } from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RecentPaymentsPanel,
  type RecentPayment,
} from "@/components/admin/recent-payments-panel";
import {
  RecentCheckinsPanel,
  type RecentCheckin,
} from "@/components/admin/recent-checkins-panel";
import { todayInSL } from "@/lib/tz";
import { RangeTabs, type RangeKey } from "@/components/admin/range-tabs";

function startOfMonthSL(todaySL: string): string {
  return `${todaySL.slice(0, 7)}-01`;
}
function startOfNextMonthSL(todaySL: string): string {
  const [y, m] = todaySL.split("-").map(Number);
  if (m === 12) return `${y + 1}-01-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/**
 * Range start (SL midnight) for the "Today/Week/Month" filter on the
 * Recent panels. UTC interpretation is a 5h30m shift earlier — we pass the
 * resulting Date straight into a `gte(...)` predicate on a `timestamptz`
 * column so Postgres compares in UTC correctly.
 */
function rangeStartSL(todaySL: string, range: RangeKey): Date {
  if (range === "today") {
    return new Date(`${todaySL}T00:00:00+05:30`);
  }
  if (range === "month") {
    return new Date(`${startOfMonthSL(todaySL)}T00:00:00+05:30`);
  }
  // week: rolling 7 days ending today (inclusive)
  const d = new Date(`${todaySL}T00:00:00+05:30`);
  d.setDate(d.getDate() - 6);
  return d;
}

function parseRange(raw: string | undefined): RangeKey {
  return raw === "week" || raw === "month" ? raw : "today";
}

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const admin = await requireAdminProfile();
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const today = todayInSL();
  const monthStart = startOfMonthSL(today);
  const monthEnd = startOfNextMonthSL(today);
  const recentRangeStart = rangeStartSL(today, range);

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
        memberPhotoUrl: profiles.photoUrl,
        amountLkr: payments.amountLkr,
        method: payments.method,
        status: payments.status,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .innerJoin(profiles, eq(profiles.id, payments.memberId))
      .where(
        and(
          eq(payments.status, "succeeded"),
          gte(payments.paidAt, recentRangeStart),
        ),
      )
      .orderBy(desc(payments.paidAt))
      .limit(10),
    db
      .select({
        id: attendance.id,
        memberId: attendance.memberId,
        memberName: profiles.fullName,
        memberPhotoUrl: profiles.photoUrl,
        gymId: profiles.gymId,
        checkedInAt: attendance.checkedInAt,
        source: attendance.source,
      })
      .from(attendance)
      .innerJoin(profiles, eq(profiles.id, attendance.memberId))
      .where(gte(attendance.checkedInAt, recentRangeStart))
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
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Welcome, {admin.fullName}</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Here&apos;s what&apos;s happening at the gym today.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/admin/plans" />}
            >
              <Tag className="size-4" />
              New plan
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/admin/pending" />}
              className="relative"
            >
              <UserPlus className="size-4" />
              Approve pending
              {pendingCount > 0 && (
                <Badge className="ml-1 -mr-1 h-5 min-w-5 px-1.5">
                  {pendingCount}
                </Badge>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/admin/members" />}
            >
              <Search className="size-4" />
              Find member
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Wallet}
            label="Total revenue"
            value={`LKR ${revenue.toLocaleString()}`}
            caption="This month"
            accentColor="blue"
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
          <Link
            href="/admin/outstanding"
            className="rounded-lg ring-offset-background transition-colors hover:[&_[data-slot=stat-card]]:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="View outstanding dues breakdown"
          >
            <StatCard
              icon={AlertCircle}
              label="Outstanding dues"
              value={`LKR ${outstandingTotal.toLocaleString()}`}
              caption={
                outstandingTotal > 0
                  ? "Click for breakdown →"
                  : "Across active members"
              }
              accentColor="red"
            />
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RecentPaymentsPanel
            rows={paymentsRaw as RecentPayment[]}
            headerSlot={<RangeTabs current={range} />}
          />
          <RecentCheckinsPanel
            rows={checkinsRaw as RecentCheckin[]}
            headerSlot={<RangeTabs current={range} />}
          />
        </div>
      </div>
    </AdminPage>
  );
}
