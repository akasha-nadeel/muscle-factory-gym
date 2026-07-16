import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { profiles, payments, attendance } from "@/db/schema";
import { and, eq, gte, lt, desc, sql } from "drizzle-orm";
import { requireAdminProfile } from "@/lib/auth";
import {
  Wallet,
  Users,
  UserPlus,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminPage } from "@/components/admin/admin-page";
import { StatCard } from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
import { RecordPaymentModal } from "@/components/admin/record-payment-modal";
import { displayName } from "@/lib/profiles/display-name";
import {
  RecentPaymentsPanel,
  type RecentPayment,
} from "@/components/admin/recent-payments-panel";
import {
  RecentCheckinsPanel,
  type RecentCheckin,
} from "@/components/admin/recent-checkins-panel";
import { todayInSL } from "@/lib/tz";
import type { RangeKey, RangeStarts } from "@/components/admin/range-toggle";
import { getOutstandingBreakdown } from "@/lib/payments/outstanding-breakdown";

function startOfMonthSL(todaySL: string): string {
  return `${todaySL.slice(0, 7)}-01`;
}
function startOfNextMonthSL(todaySL: string): string {
  const [y, m] = todaySL.split("-").map(Number);
  if (m === 12) return `${y + 1}-01-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** Start of the calendar month before the given YYYY-MM-01 date. */
function prevMonthOf(yyyymmdd: string): string {
  const [y, m] = yyyymmdd.split("-").map(Number);
  if (m === 1) return `${y - 1}-12-01`;
  return `${y}-${String(m - 1).padStart(2, "0")}-01`;
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

/**
 * Full-precision LKR with thousand-separators. Used on the dashboard
 * KPI cards — StatCard auto-shrinks the font when the string is long
 * so a 6-figure value still fits on one line.
 */
function formatLkrFull(n: number): string {
  return `LKR ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default async function AdminHome() {
  const admin = await requireAdminProfile();
  const today = todayInSL();

  // Greeting name comes from Clerk (always live) rather than profiles.full_name
  // (which can drift if the user updates their Clerk profile while the
  // webhook can't reach the app — e.g. on localhost dev). Falls back to
  // the DB value when Clerk doesn't return a user (rare — sign-out racing
  // the page render).
  const clerkUser = await currentUser().catch(() => null);
  const greetingName =
    [clerkUser?.firstName, clerkUser?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || displayName(admin.fullName);
  const monthStart = startOfMonthSL(today);
  const monthEnd = startOfNextMonthSL(today);
  // Previous month's window — used for the revenue-trend comparison on
  // the hero panel ("LKR X this month  ↑ N% vs last month").
  const prevMonthStart = prevMonthOf(monthStart);

  // Range thresholds (epoch ms, SL-correct) handed to the client panels so
  // the Today/Week/Month toggle filters already-loaded rows instantly —
  // no navigation, no re-query. We fetch ONCE from the widest window (the
  // earliest of the three starts — near month-start "week" can be wider
  // than "month") and let the client filter/slice per range.
  const rangeStarts: RangeStarts = {
    today: rangeStartSL(today, "today").getTime(),
    week: rangeStartSL(today, "week").getTime(),
    month: rangeStartSL(today, "month").getTime(),
  };
  const widestStart = new Date(
    Math.min(rangeStarts.today, rangeStarts.week, rangeStarts.month),
  );

  // Cycle-aware outstanding total — uses the same helper as /admin/outstanding
  // so dashboard + breakdown + member-detail all agree on the number.
  const outstandingQuery = getOutstandingBreakdown(today);

  const [
    revenueRow,
    prevRevenueRow,
    activeRow,
    pendingRow,
    outstandingRowsResolved,
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
      .select({ total: sql<string | null>`sum(${payments.amountLkr})` })
      .from(payments)
      .where(
        and(
          eq(payments.status, "succeeded"),
          gte(payments.paidAt, new Date(`${prevMonthStart}T00:00:00Z`)),
          lt(payments.paidAt, new Date(`${monthStart}T00:00:00Z`)),
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
          gte(payments.paidAt, widestStart),
        ),
      )
      .orderBy(desc(payments.paidAt))
      .limit(50),
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
      .where(gte(attendance.checkedInAt, widestStart))
      .orderBy(desc(attendance.checkedInAt))
      .limit(50),
  ]);

  const revenue = Number(revenueRow[0]?.total ?? 0);
  const prevRevenue = Number(prevRevenueRow[0]?.total ?? 0);
  const activeCount = Number(activeRow[0]?.count ?? 0);
  const pendingCount = Number(pendingRow[0]?.count ?? 0);
  const revenueDeltaPct =
    prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;

  const outstandingTotal = outstandingRowsResolved.reduce(
    (sum, r) => sum + Number(r.outstandingLkr),
    0,
  );

  return (
    <AdminPage breadcrumbs={[{ label: "Dashboard" }]}>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-semibold truncate">
              Welcome, {greetingName}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Here&apos;s what&apos;s happening at the gym today.
            </p>
          </div>
          {/* Action buttons: full-width row on mobile (large thumb targets),
              auto-width inline on tablet+. flex-1 splits the row evenly
              between Record payment + Approve pending. */}
          <div className="flex flex-row gap-2 w-full sm:w-auto">
            <RecordPaymentModal className="flex-1 sm:flex-initial" />
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/admin/pending" />}
              className={cn(
                "relative flex-1 sm:flex-initial",
                pendingCount > 0
                  ? // Has work to do: amber accent draws the admin's eye without
                    // competing with the orange primary CTA next to it.
                    "bg-amber-50 border-amber-500/50 text-amber-900 hover:bg-amber-100 hover:border-amber-500/70 dark:bg-amber-950/30 dark:border-amber-500/40 dark:text-amber-100 dark:hover:bg-amber-950/50"
                  : // All caught up: neutral surface with subtle fill so it
                    // stands on its own next to the orange primary instead of
                    // looking ghosted in dark mode.
                    "bg-card hover:bg-muted dark:bg-card dark:hover:bg-muted/50",
              )}
            >
              <UserPlus className="size-4" />
              Approve pending
              {pendingCount > 0 && (
                <span
                  aria-label={`${pendingCount} pending`}
                  className="ml-1 -mr-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[0.65rem] font-semibold leading-none text-white tabular-nums"
                >
                  {pendingCount}
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Revenue hero panel — promoted out of the small-card row because
            it's the gym owner's most-asked metric. Headline number gets
            full real estate; trend pill gives one-glance context vs the
            previous month; "View Reports →" makes the connection to the
            full reports page obvious. */}
        <div className="rounded-2xl border bg-gradient-to-br from-sky-500/10 via-card to-card p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="size-10 sm:size-11 rounded-xl bg-sky-500/20 text-sky-500 flex items-center justify-center shrink-0">
                <Wallet className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total revenue · This month
                </div>
                {/* truncate (not whitespace-nowrap) — long numbers like
                    "LKR 1,234,567.89" would otherwise overflow a 320px
                    mobile screen. text-2xl on mobile keeps it dense; bumps
                    to text-3xl/4xl as space allows. */}
                <div className="text-2xl sm:text-3xl md:text-4xl font-semibold tabular-nums mt-1 truncate">
                  {formatLkrFull(revenue)}
                </div>
              </div>
            </div>
            <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 sm:gap-2 shrink-0 w-full sm:w-auto">
              {revenueDeltaPct !== null && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums",
                    revenueDeltaPct >= 0
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                  )}
                >
                  {revenueDeltaPct >= 0 ? (
                    <ArrowUpRight className="size-3.5" />
                  ) : (
                    <ArrowDownRight className="size-3.5" />
                  )}
                  {revenueDeltaPct >= 0 ? "+" : ""}
                  {revenueDeltaPct.toFixed(1)}% vs last month
                </span>
              )}
              <Link
                href="/admin/reports"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                View in Reports
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Operational counts — these answer "do I need to act?". On mobile,
            Active + Pending sit side-by-side (compact glanceable pair) and
            Outstanding spans the full width below so its LKR figure has
            room to breathe. Tablet+ goes to even 3-col. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
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
            className="col-span-2 sm:col-span-1 rounded-lg ring-offset-background transition-colors hover:[&_[data-slot=stat-card]]:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="View outstanding dues breakdown"
          >
            <StatCard
              icon={AlertCircle}
              label="Outstanding dues"
              value={formatLkrFull(outstandingTotal)}
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
            rangeStarts={rangeStarts}
          />
          <RecentCheckinsPanel
            rows={checkinsRaw as RecentCheckin[]}
            rangeStarts={rangeStarts}
          />
        </div>
      </div>
    </AdminPage>
  );
}
