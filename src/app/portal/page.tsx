import { redirect } from "next/navigation";
import { requireMemberProfile } from "@/lib/auth";
import { db } from "@/db";
import { memberships, plans, payments, attendance } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getCurrentMembership } from "@/lib/memberships/current";
import { daysRemaining } from "@/lib/days-remaining";
import { todayInSL } from "@/lib/tz";
import { computeOutstanding } from "@/lib/payments/outstanding";

export default async function PortalHome() {
  const me = await requireMemberProfile();

  if (me.role === "admin") redirect("/admin");

  if (me.status === "pending") {
    return (
      <Card className="max-w-md">
        <CardHeader><CardTitle>Welcome, {me.fullName} 👋</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Your account is awaiting approval. The gym staff will activate your
            membership shortly — you can come back to this page after.
          </p>
          <p>If you need to talk to someone, visit the front desk.</p>
        </CardContent>
      </Card>
    );
  }

  if (me.status === "inactive") {
    return (
      <Card className="max-w-md">
        <CardHeader><CardTitle>Welcome back, {me.fullName}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Your account is currently inactive (no recent visits). Please drop by
            the front desk and we&apos;ll reactivate your membership.
          </p>
        </CardContent>
      </Card>
    );
  }

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
    .where(eq(memberships.memberId, me.id));

  const today = todayInSL();
  const current = getCurrentMembership(history, today);

  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.memberId, me.id))
    .orderBy(desc(payments.paidAt));

  const attendanceRows = await db
    .select()
    .from(attendance)
    .where(eq(attendance.memberId, me.id))
    .orderBy(desc(attendance.checkedInAt))
    .limit(30);

  const outstanding =
    current
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
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <h2 className="text-2xl font-semibold min-w-0 break-words">
          Welcome, {me.fullName}
        </h2>
        {me.gymId !== null && (
          <Card className="px-4 py-2 shrink-0">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Your Gym ID
            </div>
            <div className="text-2xl font-mono font-semibold tabular-nums">
              {me.gymId}
            </div>
          </Card>
        )}
      </div>

      {outstanding && Number(outstanding) > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">
              Outstanding balance: LKR {Number(outstanding).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Please visit the front desk to settle the balance.
          </CardContent>
        </Card>
      )}

      {current ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{current.planName}</span>
              <Badge>{current.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Valid:</span>{" "}
              {format(new Date(current.startDate), "PP")} – {format(new Date(current.endDate), "PP")}
            </div>
            <div>
              <span className="text-muted-foreground">Days remaining:</span>{" "}
              {Math.max(0, daysRemaining({ today, endDate: current.endDate }))}
            </div>
            <div>
              <span className="text-muted-foreground">Plan price:</span>{" "}
              LKR {Number(current.planPriceLkr).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>No active membership</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Please visit the front desk to renew.
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="text-lg font-semibold mb-3">Attendance (last 30)</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">Checked in at</TableHead>
              <TableHead className="w-32">Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attendanceRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground py-6">
                  No check-ins yet. Type your Gym ID at the front-desk kiosk to mark attendance.
                </TableCell>
              </TableRow>
            )}
            {attendanceRows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{format(r.checkedInAt, "PPp")}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {r.source === "kiosk_id" ? "Kiosk" : r.source === "qr_scan" ? "QR scan" : "Manual"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Payment history</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Paid at</TableHead>
              <TableHead className="w-28">Kind</TableHead>
              <TableHead className="w-28">Method</TableHead>
              <TableHead className="w-32 text-right">Amount (LKR)</TableHead>
              <TableHead className="w-32">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paymentRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  No payments yet.
                </TableCell>
              </TableRow>
            )}
            {paymentRows.map((p) => {
              const num = Number(p.amountLkr);
              return (
                <TableRow key={p.id} className={p.status === "refunded" ? "opacity-70" : ""}>
                  <TableCell>{format(p.paidAt, "PP")}</TableCell>
                  <TableCell>{p.kind}</TableCell>
                  <TableCell>{p.method}</TableCell>
                  <TableCell className="text-right">
                    {num < 0 ? "-" : ""}
                    {Math.abs(num).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.status === "succeeded" ? "default" : "outline"}>
                      {p.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
