import { notFound } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { profiles, memberships, plans, payments, attendance, workoutPlans } from "@/db/schema";
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
import { Wallet, Calendar, AlertCircle, Activity, Mail, Phone, IdCard } from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
import { StatCard } from "@/components/admin/stat-card";
import { StatusPill } from "@/components/admin/status-pill";
import { EmptyState } from "@/components/admin/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/initials";
import { PaymentsTable } from "./_payments-table";
import { RecordPaymentButton } from "./_record-payment-button";
import { AttendanceTable } from "./_attendance-table";
import { SendWorkoutPlanButton } from "./_send-workout-plan-button";

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

  // Pull the member's Clerk avatar so admin sees the same image Clerk uses
  // for emails / member's own profile. Falls back to DB photoUrl, then to
  // an initial avatar in the JSX below if both are missing.
  let clerkImageUrl: string | null = null;
  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(member.clerkUserId);
    clerkImageUrl = clerkUser.imageUrl ?? null;
  } catch {
    // Non-fatal — the avatar fallback renders initials.
  }
  const avatarUrl = clerkImageUrl ?? member.photoUrl ?? null;

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

  // Current workout plan (Phase 13) — at most one per member.
  const [currentWorkoutPlan] = await db
    .select({
      fileName: workoutPlans.fileName,
      createdAt: workoutPlans.createdAt,
    })
    .from(workoutPlans)
    .where(eq(workoutPlans.memberId, id))
    .limit(1);

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
        {/* Hero card */}
        <div className="rounded-xl border bg-card p-4 sm:p-6 relative">
          {/* Send workout plan: bottom-right of hero on sm+, full-width on mobile */}
          <div className="hidden sm:block absolute bottom-4 right-4">
            <SendWorkoutPlanButton
              memberId={member.id}
              memberName={member.fullName}
              currentPlan={currentWorkoutPlan ?? null}
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="relative shrink-0 self-center sm:self-start">
              <Avatar className="size-20 rounded-2xl after:rounded-2xl">
                {avatarUrl ? (
                  <AvatarImage
                    src={avatarUrl}
                    alt={member.fullName}
                    className="rounded-2xl"
                  />
                ) : null}
                <AvatarFallback className="rounded-2xl text-lg font-semibold">
                  {initialsOf(member.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                <StatusPill variant={member.status}>{member.status}</StatusPill>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left pt-3 sm:pt-0">
              <h2 className="text-2xl font-semibold leading-tight break-words">
                {member.fullName}
              </h2>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {member.gymId !== null && (
                  <span className="inline-flex items-center gap-1.5">
                    <IdCard className="size-4 shrink-0" />
                    <span>Gym ID:</span>
                    <span className="font-mono font-medium text-foreground">
                      #{member.gymId}
                    </span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-4 shrink-0" />
                  <span className="break-all">{member.email}</span>
                </span>
                {member.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-4 shrink-0" />
                    <span>{member.phone}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="size-4 shrink-0" />
                  <span>Member since {format(member.createdAt, "MMM yyyy")}</span>
                </span>
              </div>
            </div>
          </div>
          {/* Mobile: full-width button below the hero info */}
          <div className="sm:hidden mt-4">
            <SendWorkoutPlanButton
              memberId={member.id}
              memberName={member.fullName}
              currentPlan={currentWorkoutPlan ?? null}
            />
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
          {history.length === 0 ? (
            <div className="rounded-lg border bg-card">
              <EmptyState icon={Calendar} title="No memberships yet" />
            </div>
          ) : (
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
          )}
        </div>
      </div>
    </AdminPage>
  );
}
