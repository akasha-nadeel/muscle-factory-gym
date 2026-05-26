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
import { Button } from "@/components/ui/button";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Download,
  Minus,
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

function fmtLkrShort(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}LKR ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}LKR ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}LKR ${abs.toLocaleString()}`;
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
            {/* KPI tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={Wallet}
                label="Net revenue"
                value={fmtLkrShort(net)}
                caption={periodLabel[period]}
                accentColor="blue"
              />
              <ChangeStat
                hasPrev={hasPrev}
                changePct={changePct}
                prevNet={prevNet}
                period={period}
              />
              <StatCard
                icon={RotateCcw}
                label="Refunds"
                value={fmtLkrShort(totalRefunds)}
                caption={
                  refundCount === 0
                    ? "No refunds issued"
                    : `${refundCount} refund${refundCount === 1 ? "" : "s"}`
                }
                accentColor={totalRefunds > 0 ? "amber" : "default"}
              />
              <StatCard
                icon={Calendar}
                label="Monthly average"
                value={fmtLkrShort(monthlyAvg)}
                caption={
                  monthCount === 1
                    ? "1 month with activity"
                    : `${monthCount} months with activity`
                }
                accentColor="default"
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

function ChangeStat({
  hasPrev,
  changePct,
  prevNet,
  period,
}: {
  hasPrev: boolean;
  changePct: number;
  prevNet: number;
  period: ReportsPeriod;
}) {
  if (period === "all" || !hasPrev) {
    return (
      <StatCard
        icon={Minus}
        label="vs previous"
        value="—"
        caption={
          period === "all"
            ? "Not applicable for all time"
            : "No prior period data"
        }
        accentColor="default"
      />
    );
  }
  const up = changePct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  // Color: emerald when positive, amber when negative. Avoid red here
  // because the brand primary is red and we want this to read as info
  // not as a system error.
  return (
    <StatCard
      icon={Icon}
      label="vs previous period"
      value={`${up ? "+" : ""}${changePct.toFixed(1)}%`}
      caption={`Previous: LKR ${Math.round(prevNet).toLocaleString()}`}
      accentColor={up ? "green" : "amber"}
    />
  );
}
