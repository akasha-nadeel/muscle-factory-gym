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
import {
  inferCyclePeriod,
  computeNextPaymentDue,
} from "@/lib/payments/next-due";
import { daysRemaining } from "@/lib/days-remaining";
import { format as formatDate, parseISO } from "date-fns";
import { Wallet, Calendar, AlertCircle, Activity, Mail, Phone } from "lucide-react";
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
import { RenewMembershipButton } from "./_renew-button";
import { CancelMembershipButton } from "./_cancel-membership-button";
import { DeleteMemberButton } from "./_delete-member-button";
import { GymIdCopy } from "@/components/admin/gym-id-copy";
import { ApproveButton } from "@/app/admin/pending/_approve-button";
import { RejectButton } from "@/app/admin/pending/_reject-button";
import { Clock } from "lucide-react";
import { isWiped } from "@/lib/profiles/wiped";
import { displayName } from "@/lib/profiles/display-name";
import { normalizeAvatarUrl } from "@/lib/profiles/photo";
import { avatarColorClass } from "@/lib/profiles/avatar-color";

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

  const wiped = isWiped(member);

  // Pull the member's Clerk avatar AND name so admin sees what the member
  // just changed in their Clerk profile, even before the user.updated
  // webhook syncs the DB. Falls back to DB values when Clerk is briefly
  // unreachable. Non-fatal — fallbacks render below.
  let clerkImageUrl: string | null = null;
  let clerkFullName: string | null = null;
  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(member.clerkUserId);
    clerkImageUrl = clerkUser.imageUrl ?? null;
    const joined = [clerkUser.firstName, clerkUser.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    clerkFullName = joined || null;
  } catch {
    // Non-fatal — the avatar fallback renders initials.
  }
  // Strip Clerk procedurally-generated default avatars (members who
  // never uploaded a photo) so we render initials instead. Keeps the
  // hero visual consistent with member-list rows.
  const avatarUrl = normalizeAvatarUrl(clerkImageUrl ?? member.photoUrl);
  // Prefer live Clerk name; fall back to DB; displayName() strips
  // @-domain from email-as-name fallbacks.
  const heroName = displayName(clerkFullName ?? member.fullName);

  // Pending members have no history to show. Render a focused approval
  // screen with the profile hero + Approve/Reject CTAs and skip the empty
  // stat cards / payments / attendance / membership-history sections.
  if (member.status === "pending") {
    const activePlans = await db
      .select({
        id: plans.id,
        name: plans.name,
        durationDays: plans.durationDays,
        priceLkr: plans.priceLkr,
      })
      .from(plans)
      .where(eq(plans.isActive, true));

    return (
      <AdminPage
        breadcrumbs={[
          { label: "Members", href: "/admin/members" },
          { label: displayName(member.fullName) },
        ]}
      >
        <div className="space-y-6">
          {/* Hero card (no workout plan button — pending members can't view portal) */}
          <div className="rounded-xl border bg-card p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="shrink-0 self-center sm:self-start">
                <Avatar className="size-20 rounded-2xl after:rounded-2xl">
                  {avatarUrl ? (
                    <AvatarImage
                      src={avatarUrl}
                      alt={member.fullName}
                      className="rounded-2xl"
                    />
                  ) : null}
                  <AvatarFallback
                    className={`rounded-2xl text-lg font-semibold text-white ${avatarColorClass(member.fullName)}`}
                  >
                    {initialsOf(member.fullName)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                  <h2 className="text-2xl font-semibold leading-tight break-words">
                    {displayName(member.fullName)}
                  </h2>
                  <StatusPill variant="pending">pending</StatusPill>
                </div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 text-sm text-muted-foreground">
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
                    <span>Signed up {format(member.createdAt, "MMM d, yyyy")}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Focused "needs approval" empty state */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
            <div className="inline-flex items-center justify-center size-14 rounded-full bg-amber-500/15 text-amber-500 mb-4">
              <Clock className="size-7" />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {displayName(member.fullName)} is awaiting approval
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              Approve them with a plan to issue a Gym ID and grant gym access.
              Member history (payments, attendance, workout plans) appears here
              once approved. If this sign-up shouldn&apos;t proceed, you can
              reject it instead.
            </p>
            <div className="inline-flex flex-wrap items-center justify-center gap-3">
              <RejectButton memberId={member.id} memberName={member.fullName} />
              <ApproveButton
                memberId={member.id}
                memberName={member.fullName}
                memberEmail={member.email}
                memberPhotoUrl={avatarUrl}
                memberCreatedAt={member.createdAt}
                plans={activePlans}
              />
            </div>
          </div>
        </div>
      </AdminPage>
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
    .where(eq(memberships.memberId, id))
    .orderBy(desc(memberships.endDate));

  const today = todayInSL();
  const current = getCurrentMembership(history, today);

  // Renewal eligibility — shown only when the member needs (or will soon
  // need) a new membership. Hidden mid-cycle to avoid noise.
  const RENEWAL_HEADS_UP_DAYS = 14;
  const daysUntilExpiry = current
    ? Math.ceil(
        (parseISO(current.endDate).getTime() - parseISO(today).getTime()) /
          (24 * 60 * 60 * 1000),
      )
    : null;
  const renewalUrgency: "expired" | "ending-soon" | null =
    !wiped && member.status === "active"
      ? current === null
        ? "expired"
        : daysUntilExpiry !== null && daysUntilExpiry <= RENEWAL_HEADS_UP_DAYS
          ? "ending-soon"
          : null
      : null;
  // Latest membership across all statuses — used for the dialog header
  // ("Monthly expired Jun 22") and to drive the start-date math server-side.
  const latestHistoryEntry = history[0] ?? null;
  // Only fetch active plans when the button might render.
  const renewPlans = renewalUrgency
    ? await db
        .select({
          id: plans.id,
          name: plans.name,
          durationDays: plans.durationDays,
          priceLkr: plans.priceLkr,
        })
        .from(plans)
        .where(eq(plans.isActive, true))
    : [];

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
        cycleContext: {
          startDate: current.startDate,
          today,
          cyclePeriod: inferCyclePeriod(current.planName),
        },
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

  // Next payment due (calendar-aware) — only meaningful for recurring plans
  const nextPaymentDue = current
    ? computeNextPaymentDue({
        membershipStart: current.startDate,
        cyclePeriod: inferCyclePeriod(current.planName),
        today,
      })
    : null;

  const activeMembershipCaption = (() => {
    if (!current) return "None";
    if (nextPaymentDue) {
      return `Next due ${formatDate(parseISO(nextPaymentDue), "MMM d, yyyy")}`;
    }
    const days = Math.max(0, daysRemaining({ today, endDate: current.endDate }));
    return `${days} day${days === 1 ? "" : "s"} remaining`;
  })();

  return (
    <AdminPage
      breadcrumbs={[
        { label: "Members", href: "/admin/members" },
        { label: heroName },
      ]}
    >
      <div className="space-y-6">
        {wiped && (
          <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
            This member&apos;s personal data was removed after 180 days of inactivity. Financial history is retained for the gym&apos;s records.
          </div>
        )}
        {/* Hero card */}
        <div className="rounded-xl border bg-card p-4 sm:p-6 relative">
          {/* Desktop: gym id copy widget at top-right */}
          {member.gymId !== null && (
            <div className="hidden sm:block absolute top-4 right-4">
              <GymIdCopy gymId={member.gymId} />
            </div>
          )}
          {/* Hero action buttons (sm+): Renew sits left of Send Workout
              Plan so a returning member's workflow flows left-to-right. */}
          {!wiped && (
            <div className="hidden sm:flex absolute bottom-4 right-4 gap-2">
              {renewalUrgency && (
                <RenewMembershipButton
                  memberId={member.id}
                  memberName={member.fullName}
                  memberPhotoUrl={avatarUrl}
                  memberGymId={member.gymId}
                  currentPlanName={
                    current?.planName ?? latestHistoryEntry?.planName ?? null
                  }
                  currentEndDate={
                    current?.endDate ??
                    latestHistoryEntry?.endDate ??
                    null
                  }
                  urgency={renewalUrgency}
                  plans={renewPlans}
                />
              )}
              <SendWorkoutPlanButton
                memberId={member.id}
                memberName={member.fullName}
                memberPhotoUrl={avatarUrl}
                memberGymId={member.gymId}
                memberPlanName={current?.planName ?? null}
                currentPlan={currentWorkoutPlan ?? null}
              />
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="shrink-0 self-center sm:self-start">
              <Avatar className="size-20 rounded-2xl after:rounded-2xl">
                {avatarUrl ? (
                  <AvatarImage
                    src={avatarUrl}
                    alt={heroName}
                    className="rounded-2xl"
                  />
                ) : null}
                <AvatarFallback
                  className={`rounded-2xl text-lg font-semibold text-white ${avatarColorClass(heroName)}`}
                >
                  {initialsOf(heroName)}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <h2 className="text-2xl font-semibold leading-tight break-words">
                  {heroName}
                </h2>
                <StatusPill variant={member.status}>{member.status}</StatusPill>
              </div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {!wiped && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="size-4 shrink-0" />
                    <span className="break-all">{member.email}</span>
                  </span>
                )}
                {!wiped && member.phone && (
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
          {/* Mobile: gym id copy + full-width buttons stacked below hero */}
          <div className="sm:hidden mt-4 space-y-3">
            {member.gymId !== null && (
              <div className="flex justify-center">
                <GymIdCopy gymId={member.gymId} />
              </div>
            )}
            {!wiped && renewalUrgency && (
              <RenewMembershipButton
                memberId={member.id}
                memberName={member.fullName}
                memberPhotoUrl={avatarUrl}
                memberGymId={member.gymId}
                currentPlanName={
                  current?.planName ?? latestHistoryEntry?.planName ?? null
                }
                currentEndDate={
                  current?.endDate ?? latestHistoryEntry?.endDate ?? null
                }
                urgency={renewalUrgency}
                plans={renewPlans}
              />
            )}
            {!wiped && (
              <SendWorkoutPlanButton
                memberId={member.id}
                memberName={member.fullName}
                memberPhotoUrl={avatarUrl}
                memberGymId={member.gymId}
                memberPlanName={current?.planName ?? null}
                currentPlan={currentWorkoutPlan ?? null}
              />
            )}
          </div>
        </div>

        {/* Stat cards — 2x2 on mobile (compact glanceable square, like Apple
            Fitness rings), 2-col on tablet, 4-col on desktop. Tighter gap
            on mobile to fit two cards side-by-side at 320px. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
            {!wiped && (
              <RecordPaymentButton
                memberId={member.id}
                memberName={member.fullName}
                memberPhotoUrl={avatarUrl}
                memberGymId={member.gymId}
                memberPlanName={current?.planName ?? null}
                currentMembershipId={current?.id ?? null}
              />
            )}
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
            <>
              {/* Mobile: membership cards. Plan name + status header,
                  date range as muted metadata, Cancel action at bottom on
                  the still-active row. */}
              <div className="sm:hidden space-y-2">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-xl border bg-card p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium truncate">{h.planName}</div>
                      <StatusPill variant={h.status}>{h.status}</StatusPill>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(h.startDate), "MMM d, yyyy")}
                      {" – "}
                      {format(new Date(h.endDate), "MMM d, yyyy")}
                    </div>
                    {h.status === "active" && !wiped && (
                      <div className="flex justify-end pt-1">
                        <CancelMembershipButton
                          memberId={member.id}
                          membershipId={h.id}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Tablet / desktop: existing table. */}
              <div className="hidden sm:block rounded-lg border bg-card overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead className="w-32">Status</TableHead>
                      <TableHead className="w-28 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="font-medium">
                          {h.planName}
                        </TableCell>
                        <TableCell>
                          {format(new Date(h.startDate), "PP")}
                        </TableCell>
                        <TableCell>
                          {format(new Date(h.endDate), "PP")}
                        </TableCell>
                        <TableCell>
                          <StatusPill variant={h.status}>{h.status}</StatusPill>
                        </TableCell>
                        <TableCell className="text-right">
                          {/* Cancel button only on still-active rows. Expired
                              and cancelled rows show a dash (no action). */}
                          {h.status === "active" && !wiped ? (
                            <CancelMembershipButton
                              memberId={member.id}
                              membershipId={h.id}
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              —
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        {/* Danger zone: hard-delete the member */}
        <div className="pt-6 mt-6 border-t">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Danger zone
          </h3>
          <div className="rounded-lg border border-destructive/40 bg-destructive/15 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium">Remove this member permanently</div>
              <div className="text-muted-foreground">
                Wipes their Clerk account, profile, history, and workout plan.
                Cannot be undone.
              </div>
            </div>
            {!wiped && (
              <DeleteMemberButton
                memberId={member.id}
                memberName={member.fullName}
                memberPhotoUrl={avatarUrl}
                memberGymId={member.gymId}
              />
            )}
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
