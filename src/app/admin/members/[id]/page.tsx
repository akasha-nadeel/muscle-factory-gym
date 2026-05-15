import { notFound } from "next/navigation";
import { db } from "@/db";
import { profiles, memberships, plans, payments, attendance } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdminProfile } from "@/lib/auth";
import { getCurrentMembership } from "@/lib/memberships/current";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { todayInSL } from "@/lib/tz";
import { computeOutstanding } from "@/lib/payments/outstanding";
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-semibold">{member.fullName}</h2>
          <p className="text-muted-foreground">{member.email}</p>
          {member.gymId !== null && (
            <p className="text-muted-foreground text-sm mt-1">
              Gym ID: <span className="font-mono font-medium">{member.gymId}</span>
            </p>
          )}
        </div>
        <Badge
          variant={
            member.status === "active"
              ? "default"
              : member.status === "pending"
                ? "secondary"
                : "outline"
          }
        >
          {member.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div>
              <span className="text-muted-foreground">Phone:</span>{" "}
              {member.phone ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Joined:</span>{" "}
              {format(member.createdAt, "PP")}
            </div>
            <div>
              <span className="text-muted-foreground">Role:</span> {member.role}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Current membership</span>
              {outstanding && Number(outstanding) > 0 && (
                <Badge variant="destructive">
                  Outstanding: LKR {Number(outstanding).toLocaleString()}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {current ? (
              <>
                <div className="font-medium">{current.planName}</div>
                <div className="text-muted-foreground">
                  {format(new Date(current.startDate), "PP")} –{" "}
                  {format(new Date(current.endDate), "PP")}
                </div>
                <div className="text-muted-foreground mt-1">
                  Plan price: LKR{" "}
                  {Number(current.planPriceLkr).toLocaleString()}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">No active membership.</p>
            )}
          </CardContent>
        </Card>
      </div>

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

      <div>
        <h3 className="text-lg font-semibold mb-3">Attendance (last 30)</h3>
        <AttendanceTable rows={attendanceRows} />
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Membership history</h3>
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
                <TableCell>{h.planName}</TableCell>
                <TableCell>{format(new Date(h.startDate), "PP")}</TableCell>
                <TableCell>{format(new Date(h.endDate), "PP")}</TableCell>
                <TableCell>
                  <Badge
                    variant={h.status === "active" ? "default" : "outline"}
                  >
                    {h.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
