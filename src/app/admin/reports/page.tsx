import { db } from "@/db";
import { payments } from "@/db/schema";
import { desc, inArray } from "drizzle-orm";
import { requireAdminProfile } from "@/lib/auth";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { slMonthOf } from "@/lib/tz";
import { AdminPage } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/admin/empty-state";
import { BarChart3 } from "lucide-react";

type Bucket = {
  month: string; // YYYY-MM in SL
  membershipNet: number;
  admissionNet: number;
  methodCash: number;
  methodBank: number;
};

export default async function ReportsPage() {
  await requireAdminProfile();

  const rows = await db
    .select()
    .from(payments)
    .where(inArray(payments.status, ["succeeded", "refunded"]))
    .orderBy(desc(payments.paidAt));

  // Bucket by SL month.
  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    const month = slMonthOf(r.paidAt);
    const b =
      buckets.get(month) ??
      ({ month, membershipNet: 0, admissionNet: 0, methodCash: 0, methodBank: 0 } as Bucket);
    const amount = Number(r.amountLkr);
    if (r.kind === "membership") b.membershipNet += amount;
    else b.admissionNet += amount;
    if (r.method === "cash") b.methodCash += amount;
    else if (r.method === "bank_transfer") b.methodBank += amount;
    buckets.set(month, b);
  }
  const sortedMonths = Array.from(buckets.values()).sort((a, b) =>
    b.month.localeCompare(a.month),
  );

  // Grand totals
  const totalMembership = sortedMonths.reduce((s, b) => s + b.membershipNet, 0);
  const totalAdmission = sortedMonths.reduce((s, b) => s + b.admissionNet, 0);
  const totalCash = sortedMonths.reduce((s, b) => s + b.methodCash, 0);
  const totalBank = sortedMonths.reduce((s, b) => s + b.methodBank, 0);

  function fmt(n: number) {
    return (n < 0 ? "-" : "") + Math.abs(n).toLocaleString();
  }

  return (
    <AdminPage breadcrumbs={[{ label: "Reports" }]}>
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold">Reports</h2>

      <div>
        <h3 className="text-lg font-semibold mb-3">Monthly revenue (Sri Lanka time)</h3>
        {sortedMonths.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <EmptyState
              icon={BarChart3}
              title="No payments recorded yet"
              description="Once members start paying, monthly totals show up here."
            />
          </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Month</TableHead>
              <TableHead className="text-right">Membership (LKR)</TableHead>
              <TableHead className="text-right">Admission (LKR)</TableHead>
              <TableHead className="text-right">Cash (LKR)</TableHead>
              <TableHead className="text-right">Bank transfer (LKR)</TableHead>
              <TableHead className="text-right">Total (LKR)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedMonths.map((b) => (
              <TableRow key={b.month}>
                <TableCell className="font-medium">{b.month}</TableCell>
                <TableCell className="text-right">{fmt(b.membershipNet)}</TableCell>
                <TableCell className="text-right">{fmt(b.admissionNet)}</TableCell>
                <TableCell className="text-right">{fmt(b.methodCash)}</TableCell>
                <TableCell className="text-right">{fmt(b.methodBank)}</TableCell>
                <TableCell className="text-right font-medium">
                  {fmt(b.membershipNet + b.admissionNet)}
                </TableCell>
              </TableRow>
            ))}
            {sortedMonths.length > 0 ? (
              <TableRow className="border-t-2">
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold">{fmt(totalMembership)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(totalAdmission)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(totalCash)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(totalBank)}</TableCell>
                <TableCell className="text-right font-semibold">
                  {fmt(totalMembership + totalAdmission)}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Sums include refunds (negative amounts) so revenue is net of refunds.
          Months bucket by Sri Lanka local time (UTC+5:30).
        </p>
      </div>
    </div>
    </AdminPage>
  );
}
