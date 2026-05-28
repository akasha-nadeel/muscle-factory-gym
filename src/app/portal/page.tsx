import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { requireMemberProfile } from "@/lib/auth";
import { db } from "@/db";
import { memberships, plans, payments, attendance, workoutPlans } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  FileText, Eye, Download,
  Wallet, Calendar, AlertCircle, Activity, Mail,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatCard } from "@/components/admin/stat-card";
import { StatusPill } from "@/components/admin/status-pill";
import { GymIdCopy } from "@/components/admin/gym-id-copy";
import { initialsOf } from "@/lib/initials";
import { getCurrentMembership } from "@/lib/memberships/current";
import { daysRemaining } from "@/lib/days-remaining";
import { todayInSL, formatSLDate, formatSLTime, formatSLDateTime } from "@/lib/tz";
import { computeOutstanding } from "@/lib/payments/outstanding";
import {
  inferCyclePeriod,
  computeNextPaymentDue,
} from "@/lib/payments/next-due";
import { parseISO } from "date-fns";
import { signedWorkoutPlanUrl } from "@/lib/storage/supabase-storage";
import { displayName } from "@/lib/profiles/display-name";
import { normalizeAvatarUrl } from "@/lib/profiles/photo";
import { avatarColorClass } from "@/lib/profiles/avatar-color";

export default async function PortalHome() {
  const me = await requireMemberProfile();
  // Defensive: the layout's requireMember() already redirects admins to /admin
  // based on sessionClaims, but those claims can be stale for a few seconds
  // after sign-in. requireMemberProfile reads the DB role (authoritative),
  // so we catch the stale-session case here too.
  if (me.role === "admin") redirect("/admin");

  if (me.status === "pending") {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <p className="text-base sm:text-lg font-medium text-foreground/75 mb-4">
          <span aria-hidden>👋</span> Welcome, {displayName(me.fullName)}
        </p>
        <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight max-w-2xl">
          Your account is awaiting approval
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground mt-4 max-w-md">
          We&apos;ll activate your membership shortly. Reach out to the coach
          if you have any questions.
        </p>
        <a
          href="https://wa.me/94769419792"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-10 inline-flex items-center gap-2 rounded-md bg-[#25D366] hover:bg-[#1ebe5a] text-white font-medium px-6 py-3 text-base transition-colors"
        >
          <svg
            aria-hidden
            viewBox="0 0 32 32"
            className="size-5 fill-current"
          >
            <path d="M16.003 3.2C8.94 3.2 3.2 8.937 3.2 16c0 2.255.59 4.45 1.71 6.388L3.2 28.8l6.583-1.72A12.785 12.785 0 0 0 16 28.8C23.063 28.8 28.8 23.063 28.8 16S23.063 3.2 16.003 3.2zm0 23.36a10.55 10.55 0 0 1-5.378-1.468l-.385-.228-3.91 1.022 1.044-3.812-.252-.4A10.522 10.522 0 0 1 5.44 16c0-5.83 4.73-10.56 10.563-10.56 5.83 0 10.557 4.73 10.557 10.56s-4.727 10.56-10.557 10.56zm5.78-7.91c-.314-.158-1.856-.916-2.144-1.022-.288-.105-.498-.158-.708.157-.21.314-.812 1.022-.996 1.232-.184.21-.367.236-.681.078-.314-.157-1.323-.487-2.52-1.552-.93-.83-1.557-1.853-1.74-2.166-.184-.314-.02-.484.138-.64.142-.142.314-.367.472-.55.157-.184.21-.315.314-.524.105-.21.052-.394-.026-.552-.078-.157-.708-1.706-.97-2.337-.256-.614-.516-.53-.708-.54-.184-.01-.394-.012-.604-.012-.21 0-.55.078-.838.394-.288.314-1.1 1.075-1.1 2.624 0 1.548 1.126 3.044 1.283 3.254.158.21 2.215 3.382 5.367 4.74.75.324 1.336.517 1.792.662.753.24 1.438.206 1.98.125.604-.09 1.856-.758 2.118-1.49.262-.733.262-1.36.184-1.49-.078-.131-.288-.21-.604-.367z" />
          </svg>
          Chat with the coach
        </a>
        <p className="text-xs text-muted-foreground mt-6">
          Or visit the front desk.
        </p>
      </div>
    );
  }

  if (me.status === "inactive") {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <p className="text-base sm:text-lg font-medium text-foreground/75 mb-4">
          <span aria-hidden>👋</span> Welcome back, {displayName(me.fullName)}
        </p>
        <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight max-w-2xl">
          Your membership is inactive
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground mt-4 max-w-md">
          Drop by the front desk and we&apos;ll reactivate your membership.
        </p>
      </div>
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

  // Phase 13: current workout plan (latest-only). Signed URLs are
  // generated server-side and expire in 1 hour. Wrapped in try/catch so a
  // storage misconfiguration (e.g., SUPABASE_URL not set in dev) doesn't
  // 500 the whole portal — the card just won't render.
  const [planRow] = await db
    .select({
      fileName: workoutPlans.fileName,
      storagePath: workoutPlans.storagePath,
      createdAt: workoutPlans.createdAt,
    })
    .from(workoutPlans)
    .where(eq(workoutPlans.memberId, me.id))
    .limit(1);
  let workoutPlanView: {
    fileName: string;
    createdAt: Date;
    viewUrl: string;
    downloadUrl: string;
    /** Whole days remaining until the expire-workout-plans cron deletes it.
     * Negative means the cron just hasn't run yet (window has lapsed). */
    daysUntilExpiry: number;
  } | null = null;
  if (planRow) {
    try {
      const [viewUrl, downloadUrl] = await Promise.all([
        signedWorkoutPlanUrl(planRow.storagePath),
        signedWorkoutPlanUrl(planRow.storagePath, {
          downloadAs: planRow.fileName,
        }),
      ]);
      // Workout plans live for 5 days from upload. Ceil so a plan uploaded
      // 4 days 1 hour ago shows "Expires in 1 day", not "Expires today".
      const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
      const ageMs = Date.now() - planRow.createdAt.getTime();
      const remainingMs = FIVE_DAYS_MS - ageMs;
      const daysUntilExpiry = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
      workoutPlanView = {
        fileName: planRow.fileName,
        createdAt: planRow.createdAt,
        viewUrl,
        downloadUrl,
        daysUntilExpiry,
      };
    } catch (err) {
      console.warn(`[portal] failed to sign workout plan URL: ${String(err)}`);
    }
  }

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
          cycleContext: {
            startDate: current.startDate,
            today,
            cyclePeriod: inferCyclePeriod(current.planName),
          },
        })
      : null;

  // Hero avatar AND name come from Clerk live — keeps the portal in sync
  // with whatever the member just changed in their Clerk profile, even if
  // the user.updated webhook hasn't reached us yet (e.g. localhost dev,
  // or a brief webhook delay on prod). Falls back to DB values when Clerk
  // is briefly unreachable. Non-fatal — try/catch keeps the page rendering.
  let clerkImageUrl: string | null = null;
  let clerkFullName: string | null = null;
  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(me.clerkUserId);
    clerkImageUrl = clerkUser.imageUrl ?? null;
    const joined = [clerkUser.firstName, clerkUser.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    clerkFullName = joined || null;
  } catch {
    // ignore — DB fallbacks render below
  }
  const avatarUrl = normalizeAvatarUrl(clerkImageUrl ?? me.photoUrl);
  // Prefer live Clerk name; fall back to DB-stored fullName; displayName()
  // strips @-domain when the value is still an email-as-name.
  const heroName = displayName(clerkFullName ?? me.fullName);

  // Lifetime totals for the stat cards.
  const totalPaid = paymentRows
    .filter((p) => p.status === "succeeded")
    .reduce((s, p) => s + Number(p.amountLkr), 0);
  const [{ value: totalCheckins }] = await db
    .select({ value: count() })
    .from(attendance)
    .where(eq(attendance.memberId, me.id));

  // Calendar-aware "next payment due" — Oct 5 monthly → Nov 5, etc.
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
      return `Next due ${format(parseISO(nextPaymentDue), "MMM d, yyyy")}`;
    }
    const days = Math.max(0, daysRemaining({ today, endDate: current.endDate }));
    return `${days} day${days === 1 ? "" : "s"} remaining`;
  })();

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Profile</h3>
        <div className="rounded-xl border bg-card p-4 sm:p-6 relative">
          {/* Desktop: gym id copy widget at top-right */}
          {me.gymId !== null && (
            <div className="hidden sm:block absolute top-4 right-4">
              <GymIdCopy gymId={me.gymId} />
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
              <StatusPill variant="active">active</StatusPill>
            </div>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-4 shrink-0" />
                <span className="break-all">{me.email}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-4 shrink-0" />
                <span>Member since {format(me.createdAt, "MMM yyyy")}</span>
              </span>
            </div>
          </div>
        </div>
        {/* Mobile: gym id copy widget below hero info */}
        {me.gymId !== null && (
          <div className="sm:hidden mt-4 flex justify-center">
            <GymIdCopy gymId={me.gymId} />
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
              ? "Visit front desk"
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

      {workoutPlanView && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Workout plan</h3>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="size-10 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {workoutPlanView.fileName}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Uploaded {format(workoutPlanView.createdAt, "PP")}
                </div>
                {(() => {
                  const d = workoutPlanView.daysUntilExpiry;
                  if (d < 0) {
                    return (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Expired — ask your trainer to resend.
                      </div>
                    );
                  }
                  if (d === 0) {
                    return (
                      <div className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-0.5">
                        Expires today — download now
                      </div>
                    );
                  }
                  if (d === 1) {
                    return (
                      <div className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-0.5">
                        Expires tomorrow
                      </div>
                    );
                  }
                  return (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Expires in {d} days
                    </div>
                  );
                })()}
              </div>
              {workoutPlanView.daysUntilExpiry >= 0 && (
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <a
                        href={workoutPlanView.viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                  >
                    <Eye className="size-4" />
                    <span className="hidden sm:inline">View</span>
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-500 hover:bg-emerald-600 text-white"
                    render={<a href={workoutPlanView.downloadUrl} />}
                  >
                    <Download className="size-4" />
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold mb-3">Attendance (last 30)</h3>

        {/* Mobile: stacked cards */}
        <div className="md:hidden space-y-2">
          {attendanceRows.length === 0 ? (
            <div className="rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              No check-ins yet. Type your Gym ID at the front-desk kiosk to mark attendance.
            </div>
          ) : (
            attendanceRows.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border bg-card px-3 py-2.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 text-sm">
                  <div className="font-medium">{formatSLDate(r.checkedInAt)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatSLTime(r.checkedInAt)}
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {r.source === "kiosk_id" ? "Kiosk" : r.source === "qr_scan" ? "QR scan" : "Manual"}
                </Badge>
              </div>
            ))
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block overflow-x-auto">
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
                  <TableCell>{formatSLDateTime(r.checkedInAt)}</TableCell>
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
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Payment history</h3>

        {/* Mobile: stacked cards. Five-column tables don't fit on phone
            widths; the card layout keeps each payment legible and
            scannable. */}
        <div className="md:hidden space-y-2">
          {paymentRows.length === 0 ? (
            <div className="rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              No payments yet.
            </div>
          ) : (
            paymentRows.map((p) => {
              const num = Number(p.amountLkr);
              return (
                <div
                  key={p.id}
                  className={`rounded-lg border bg-card px-3 py-2.5 ${
                    p.status === "refunded" ? "opacity-70" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium tabular-nums">
                        {num < 0 ? "-" : ""}LKR{" "}
                        {Math.abs(num).toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(p.paidAt, "PP")} · {p.kind} · {p.method}
                      </div>
                    </div>
                    <StatusPill variant={p.status}>{p.status}</StatusPill>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop: standard table, scrollable horizontally as a safety
            net for unusually narrow desktop widths. */}
        <div className="hidden md:block overflow-x-auto">
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
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-6"
                  >
                    No payments yet.
                  </TableCell>
                </TableRow>
              )}
              {paymentRows.map((p) => {
                const num = Number(p.amountLkr);
                return (
                  <TableRow
                    key={p.id}
                    className={p.status === "refunded" ? "opacity-70" : ""}
                  >
                    <TableCell>{format(p.paidAt, "PP")}</TableCell>
                    <TableCell>{p.kind}</TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num < 0 ? "-" : ""}
                      {Math.abs(num).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <StatusPill variant={p.status}>{p.status}</StatusPill>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
