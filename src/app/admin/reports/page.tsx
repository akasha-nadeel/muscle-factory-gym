import Link from "next/link";
import { and, desc, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { requireAdminProfile } from "@/lib/auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  slDateMonthsAgo,
  slDateToUTC,
  slMonthOf,
  startOfSLYear,
  todayInSL,
} from "@/lib/tz";
import { AdminPage } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/admin/empty-state";
import { StatCard } from "@/components/admin/stat-card";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Download,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { ReportsChart } from "@/components/admin/reports-chart";
import { ReportsRevenueBars } from "@/components/admin/reports-revenue-bars";
import { ReportsMethodBars } from "@/components/admin/reports-method-bars";
import {
  ReportsPeriodTabs,
  type ReportsPeriod,
} from "@/components/admin/reports-period-tabs";

type Bucket = {
  month: string; // YYYY-MM in SL
  membershipGross: number;
  admissionGross: number;
  cash: number;
  bank: number;
  refunds: number; // surfaced positive
};

function parsePeriod(raw: string | undefined): ReportsPeriod {
  if (raw === "ytd" || raw === "all") return raw;
  return "12mo";
}

function periodCutoff(period: ReportsPeriod, todaySL: string): string | null {
  if (period === "all") return null;
  if (period === "ytd") return startOfSLYear(todaySL);
  return slDateMonthsAgo(12, todaySL);
}

function previousPeriodWindow(
  period: ReportsPeriod,
  todaySL: string,
): { from: string; to: string } | null {
  if (period === "all") return null;
  if (period === "ytd") {
    // Same number of days into last year. Use the same calendar date in the
    // previous year as `to`, and last year's Jan 1 as `from`. Cheap heuristic
    // for "vs same period last year" KPI.
    const [y] = todaySL.split("-").map(Number);
    const lastYearTo = `${y - 1}${todaySL.slice(4)}`;
    return { from: `${y - 1}-01-01`, to: lastYearTo };
  }
  // 12mo: previous 12 months are months 13–24 ago.
  return {
    from: slDateMonthsAgo(24, todaySL),
    to: slDateMonthsAgo(12, todaySL),
  };
}

/** Full-precision LKR with thousand-separators. StatCard auto-shrinks
 * the font when the string is long so a 6-figure value still fits on
 * one line — see src/components/admin/stat-card.tsx::valueFontSize. */
function fmtLkr(n: number): string {
  return `LKR ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtNum(n: number): string {
  return (n < 0 ? "-" : "") + Math.abs(n).toLocaleString();
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireAdminProfile();
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const todaySL = todayInSL();
  const cutoff = periodCutoff(period, todaySL);
  const prev = previousPeriodWindow(period, todaySL);

  // Current period rows
  const currentConds = [inArray(payments.status, ["succeeded", "refunded"])];
  if (cutoff) currentConds.push(gte(payments.paidAt, slDateToUTC(cutoff)));
  const currentRows = await db
    .select()
    .from(payments)
    .where(and(...currentConds))
    .orderBy(desc(payments.paidAt));

  // Previous period rows (for the change KPI). Only fetch when needed.
  const previousRows = prev
    ? await db
        .select({ amountLkr: payments.amountLkr, status: payments.status })
        .from(payments)
        .where(
          and(
            inArray(payments.status, ["succeeded", "refunded"]),
            gte(payments.paidAt, slDateToUTC(prev.from)),
            lt(payments.paidAt, slDateToUTC(prev.to)),
          ),
        )
    : [];

  // Bucket current period by SL month.
  const buckets = new Map<string, Bucket>();
  for (const r of currentRows) {
    const month = slMonthOf(r.paidAt);
    const b =
      buckets.get(month) ??
      ({
        month,
        membershipGross: 0,
        admissionGross: 0,
        cash: 0,
        bank: 0,
        refunds: 0,
      } as Bucket);
    const amount = Number(r.amountLkr);
    if (r.status === "refunded") {
      b.refunds += Math.abs(amount);
    } else {
      if (r.kind === "membership") b.membershipGross += amount;
      else b.admissionGross += amount;
      if (r.method === "cash") b.cash += amount;
      else if (r.method === "bank_transfer") b.bank += amount;
    }
    buckets.set(month, b);
  }
  const sortedDesc = Array.from(buckets.values()).sort((a, b) =>
    b.month.localeCompare(a.month),
  );

  // Aggregates for the current period
  const totalMembership = sortedDesc.reduce(
    (s, b) => s + b.membershipGross,
    0,
  );
  const totalAdmission = sortedDesc.reduce((s, b) => s + b.admissionGross, 0);
  const totalCash = sortedDesc.reduce((s, b) => s + b.cash, 0);
  const totalBank = sortedDesc.reduce((s, b) => s + b.bank, 0);
  const totalRefunds = sortedDesc.reduce((s, b) => s + b.refunds, 0);
  const gross = totalMembership + totalAdmission;
  const net = gross - totalRefunds;
  const refundCount = currentRows.filter((r) => r.status === "refunded")
    .length;
  const monthCount = sortedDesc.length;
  const monthlyAvg = monthCount > 0 ? net / monthCount : 0;

  // Previous-period net for the change KPI
  const prevNet = previousRows.reduce((s, r) => {
    const a = Number(r.amountLkr);
    return r.status === "refunded" ? s - Math.abs(a) : s + a;
  }, 0);
  const hasPrev = prev !== null && previousRows.length > 0;
  const changePct =
    hasPrev && prevNet !== 0 ? ((net - prevNet) / Math.abs(prevNet)) * 100 : 0;

  const periodLabel: Record<ReportsPeriod, string> = {
    "12mo": "Last 12 months",
    ytd: "This year",
    all: "All time",
  };

  // CSV download href preserves the current period.
  const csvHref =
    period === "12mo"
      ? "/api/admin/reports/csv"
      : `/api/admin/reports/csv?period=${period}`;

  return (
    <AdminPage breadcrumbs={[{ label: "Reports" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Reports</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Sri Lanka time · figures net of refunds
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ReportsPeriodTabs current={period} />
            <Button
              size="sm"
              variant="outline"
              render={
                <a href={csvHref} download>
                  <Download className="size-4" />
                  Download CSV
                </a>
              }
            />
          </div>
        </div>

        {sortedDesc.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <EmptyState
              icon={BarChart3}
              title="No payments in this period"
              description="Switch to a wider period or record payments to see reports here."
            />
          </div>
        ) : (
          <>
            {/* Net revenue hero — same pattern as the admin dashboard
                Total Revenue panel. Headline gets full real-estate;
                trend pill on the right shows direction vs the previous
                period. Period label echoes the chosen tab. */}
            <div className="rounded-2xl border bg-gradient-to-br from-sky-500/10 via-card to-card p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="size-11 rounded-xl bg-sky-500/20 text-sky-500 flex items-center justify-center shrink-0">
                    <Wallet className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Net revenue · {periodLabel[period]}
                    </div>
                    <div className="text-3xl sm:text-4xl font-semibold tabular-nums mt-1 whitespace-nowrap">
                      {fmtLkr(net)}
                    </div>
                  </div>
                </div>
                {hasPrev && period !== "all" && (
                  <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums",
                        changePct >= 0
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {changePct >= 0 ? (
                        <ArrowUpRight className="size-3.5" />
                      ) : (
                        <ArrowDownRight className="size-3.5" />
                      )}
                      {changePct >= 0 ? "+" : ""}
                      {changePct.toFixed(1)}% vs previous period
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Previous: {fmtLkr(prevNet)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Supporting metrics — three equal-weight cards now that
                revenue has its own hero. Same density as the admin
                dashboard's operational row. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                icon={RotateCcw}
                label="Refunds"
                value={fmtLkr(totalRefunds)}
                caption={
                  refundCount === 0
                    ? "No refunds issued"
                    : `${refundCount} refund${refundCount === 1 ? "" : "s"}`
                }
                // Always amber — refunds are money leaving the gym, that's
                // the right semantic regardless of magnitude. Mirrors the
                // dashboard's "Pending approvals" card which is also amber
                // (attention/awareness, not error).
                accentColor="amber"
              />
              <StatCard
                icon={Calendar}
                label="Monthly average"
                value={fmtLkr(monthlyAvg)}
                caption={
                  monthCount === 1
                    ? "1 month with activity"
                    : `${monthCount} months with activity`
                }
                // Blue = informational/financial — same color the dashboard
                // uses for its revenue stat surfaces.
                accentColor="blue"
              />
              <StatCard
                icon={BarChart3}
                label="Months with activity"
                value={monthCount}
                caption={`out of ${
                  period === "12mo"
                    ? 12
                    : period === "ytd"
                      ? new Date().getMonth() + 1
                      : monthCount
                }`}
                // Green = positive consistency metric; matches the
                // dashboard's "Active members" card semantically.
                accentColor="green"
              />
            </div>

            {/* Trend chart */}
            <ReportsRevenueBars
              buckets={sortedDesc.map((b) => ({
                month: b.month,
                membership: b.membershipGross,
                admission: b.admissionGross,
              }))}
            />

            {/* Composition charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ReportsChart
                buckets={sortedDesc.map((b) => ({
                  month: b.month,
                  membershipNet: b.membershipGross,
                  admissionNet: b.admissionGross,
                }))}
              />
              <ReportsMethodBars cash={totalCash} bank={totalBank} />
            </div>

            {/* Detailed table */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                Detailed breakdown
              </h3>
              <div className="rounded-lg border bg-card overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Month</TableHead>
                      <TableHead className="text-right">
                        Membership
                      </TableHead>
                      <TableHead className="text-right">Admission</TableHead>
                      <TableHead className="text-right">Cash</TableHead>
                      <TableHead className="text-right">Bank</TableHead>
                      <TableHead className="text-right">Refunds</TableHead>
                      <TableHead className="text-right">Net total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedDesc.map((b) => {
                      const rowNet =
                        b.membershipGross + b.admissionGross - b.refunds;
                      return (
                        <TableRow key={b.month}>
                          <TableCell className="font-medium tabular-nums">
                            {b.month}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtNum(b.membershipGross)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtNum(b.admissionGross)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtNum(b.cash)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtNum(b.bank)}
                          </TableCell>
                          <TableCell
                            className={
                              "text-right tabular-nums " +
                              (b.refunds > 0
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground")
                            }
                          >
                            {b.refunds > 0 ? `−${fmtNum(b.refunds)}` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {fmtNum(rowNet)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="border-t-2 bg-muted/30">
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmtNum(totalMembership)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmtNum(totalAdmission)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmtNum(totalCash)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmtNum(totalBank)}
                      </TableCell>
                      <TableCell
                        className={
                          "text-right font-semibold tabular-nums " +
                          (totalRefunds > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground")
                        }
                      >
                        {totalRefunds > 0 ? `−${fmtNum(totalRefunds)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmtNum(net)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Months bucket by Sri Lanka local time (UTC+5:30). Refunds are
                shown as a separate column rather than netted silently — the
                Net total column subtracts them.
              </p>
            </div>
          </>
        )}
      </div>
    </AdminPage>
  );
}

