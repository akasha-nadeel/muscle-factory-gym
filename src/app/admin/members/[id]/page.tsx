import { notFound } from "next/navigation";
import { db } from "@/db";
import { profiles, memberships, plans, payments, attendance } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { requireAdminProfile } from "@/lib/auth";
import { getCurrentMembership } from "@/lib/memberships/current";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { todayInSL } from "@/lib/tz";
import { computeOutstanding } from "@/lib/payments/outstanding";
import { daysRemaining } from "@/lib/days-remaining";
import { Wallet, Calendar, AlertCircle, Activity } from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
import { StatCard } from "@/components/admin/stat-card";
import { StatusPill } from "@/components/admin/status-pill";
import { PaymentsTable } from "./_payments-table";
import { RecordPaymentButton } from "./_record-payment-button";
import { AttendanceTable } from "./_attendance-table";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminProfile();
  const { id } = await params;

  const [member] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  if (!member) notFound();

  const history = await db
    .select({
      id: memberships.id,
      status: memberships.status,
      startDate: memberships.startDate,
      endDate: memberships.endDate,
      planName: plans.name,
      planPriceLkr: plans.priceLkr,
    })
    .from(memberships)
    .innerJoin(plans, eq(memberships.planId, plans.id))
    .where(eq(memberships.memberId, id))
    .orderBy(desc(memberships.endDate));

  const today = todayInSL();
  const current = getCurrentMembership(history, today);

  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.memberId, id))
    .orderBy(desc(payments.paidAt));

  const refundedReferences = new Set(
    paymentRows
      .filter((p) => p.status === "refunded" && p.reference)
      .map((p) => p.reference!),
  );

  const attendanceRows = await db
    .select()
    .from(attendance)
    .where(eq(attendance.memberId, id))
    .orderBy(desc(attendance.checkedInAt))
    .limit(30);

  const outstanding = current
    ? computeOutstanding({
        planPriceLkr: current.planPriceLkr,
        payments: paymentRows.map((p) => ({
          id: p.id,
          amountLkr: p.amountLkr,
          kind: p.kind,
          status: p.status,
          membershipId: p.membershipId,
        })),
        membershipId: current.id,
      })
    : null;

  // Lifetime totals for stat cards
  const totalPaid = paymentRows
    .filter((p) => p.status === "succeeded")
    .reduce((s, p) => s + Number(p.amountLkr), 0);
  const [{ value: totalCheckins }] = await db
    .select({ value: count() })
    .from(attendance)
    .where(eq(attendance.memberId, id));

  const activeMembershipCaption = (() => {
    if (!current) return "None";
    const days = Math.max(0, daysRemaining({ today, endDate: current.endDate }));
    return `${days} day${days === 1 ? "" : "s"} remaining`;
  })();

  return (
    <AdminPage
      breadcrumbs={[
        { label: "Members", href: "/admin/members" },
        { label: member.fullName },
      ]}
    >
      <div className="space-y-6">
        {/* Hero row */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold truncate">
                {member.fullName}
              </h2>
              <StatusPill variant={member.status}>{member.status}</StatusPill>
            </div>
            <div className="text-muted-foreground text-sm mt-1">
              {member.email}
            </div>
            {member.gymId !== null && (
              <div className="text-muted-foreground text-sm mt-0.5">
                Gym ID:{" "}
                <span className="font-mono font-medium text-foreground">
                  {member.gymId}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Wallet}
            label="Total paid"
            value={`LKR ${totalPaid.toLocaleString()}`}
            caption="Lifetime succeeded"
            accentColor="green"
          />
          <StatCard
            icon={Calendar}
            label="Active membership"
            value={current?.planName ?? "—"}
            caption={activeMembershipCaption}
            accentColor="blue"
          />
          <StatCard
            icon={AlertCircle}
            label="Outstanding"
            value={
              outstanding && Number(outstanding) > 0
                ? `LKR ${Number(outstanding).toLocaleString()}`
                : "Settled"
            }
            caption={
              outstanding && Number(outstanding) > 0
                ? "Action required"
                : "All clear"
            }
            accentColor={
              outstanding && Number(outstanding) > 0 ? "red" : "green"
            }
          />
          <StatCard
            icon={Activity}
            label="Total check-ins"
            value={totalCheckins}
            caption="Lifetime"
            accentColor="amber"
          />
        </div>

        {/* Payments */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold">Payments</h3>
            <RecordPaymentButton
              memberId={member.id}
              currentMembershipId={current?.id ?? null}
            />
          </div>
          <PaymentsTable
            rows={paymentRows}
            refundedReferences={refundedReferences}
          />
        </div>

        {/* Attendance */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Attendance (last 30)</h3>
          <AttendanceTable rows={attendanceRows} />
        </div>

        {/* Membership history */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Membership history</h3>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground py-6"
                    >
                      No memberships yet.
                    </TableCell>
                  </TableRow>
                )}
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.planName}</TableCell>
                    <TableCell>
                      {format(new Date(h.startDate), "PP")}
                    </TableCell>
                    <TableCell>{format(new Date(h.endDate), "PP")}</TableCell>
                    <TableCell>
                      <StatusPill variant={h.status}>{h.status}</StatusPill>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
