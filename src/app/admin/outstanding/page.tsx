import Link from "next/link";
import { format } from "date-fns";
import { AlertCircle } from "lucide-react";
import { requireAdminProfile } from "@/lib/auth";
import { todayInSL } from "@/lib/tz";
import { daysRemaining } from "@/lib/days-remaining";
import { getOutstandingBreakdown } from "@/lib/payments/outstanding-breakdown";
import { AdminPage } from "@/components/admin/admin-page";
import { MemberAvatar } from "@/components/admin/member-avatar";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function OutstandingPage() {
  await requireAdminProfile();
  const today = todayInSL();
  const rows = await getOutstandingBreakdown(today);
  const total = rows.reduce(
    (s, r) => s + Number(r.outstandingLkr),
    0,
  );

  return (
    <AdminPage
      breadcrumbs={[
        { label: "Dashboard", href: "/admin" },
        { label: "Outstanding dues" },
      ]}
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Outstanding dues</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Members with an active membership who haven&apos;t fully paid for
            it yet.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <EmptyState
              icon={AlertCircle}
              title="No outstanding dues"
              description="Every active member is paid up. Nice."
            />
          </div>
        ) : (
          <>
            <div className="rounded-lg border bg-card p-4 sm:p-5 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total outstanding
                </div>
                <div className="text-2xl font-semibold tabular-nums mt-0.5">
                  LKR {total.toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Members owing
                </div>
                <div className="text-2xl font-semibold tabular-nums mt-0.5">
                  {rows.length}
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead className="w-24">Gym ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Plan price</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="w-40">Ends</TableHead>
                    <TableHead className="w-24 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const daysLeft = Math.max(
                      0,
                      daysRemaining({ today, endDate: r.membershipEndDate }),
                    );
                    return (
                      <TableRow key={r.memberId}>
                        <TableCell>
                          <MemberAvatar
                            size="sm"
                            fullName={r.fullName}
                            photoUrl={r.photoUrl}
                          />
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">
                          {r.gymId ?? "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {r.fullName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.planName}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(r.priceLkr).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {Number(r.paidLkr).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-status-danger">
                          {Number(r.outstandingLkr).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(r.membershipEndDate), "PP")}
                          <div className="text-xs">
                            {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            render={
                              <Link href={`/admin/members/${r.memberId}`} />
                            }
                            size="sm"
                            variant="ghost"
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </AdminPage>
  );
}
