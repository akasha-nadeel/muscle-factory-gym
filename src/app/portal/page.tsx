import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { requireMemberProfile } from "@/lib/auth";
import { db } from "@/db";
import { memberships, plans, payments, attendance, workoutPlans } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  FileText, Eye, Download,
  Wallet, AlertCircle, Activity, Calendar as CalendarIcon,
  Sparkles, AlertTriangle,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatCard } from "@/components/admin/stat-card";
import { StatusPill } from "@/components/admin/status-pill";
import { GymIdCopy } from "@/components/admin/gym-id-copy";
import { initialsOf } from "@/lib/initials";
import { getCurrentMembership } from "@/lib/memberships/current";
import { daysRemaining } from "@/lib/days-remaining";
import { todayInSL } from "@/lib/tz";
import { RecentActivity } from "./_recent-activity";
import { PaymentList } from "./_payment-list";
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

  // Greeting based on time of SL day — small personalization touch that
  // makes the portal feel less institutional.
  const hour = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }),
  ).getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Renewal urgency surfaced as a banner — drives action when expiry is
  // imminent. Threshold matches what the admin uses for the Renew button.
  const RENEWAL_HEADS_UP_DAYS = 7;
  const daysLeft =
    current !== null
      ? Math.max(
          0,
          daysRemaining({ today, endDate: current.endDate }),
        )
      : null;
  const showRenewalWarning =
    current !== null && daysLeft !== null && daysLeft <= RENEWAL_HEADS_UP_DAYS;
  const hasOutstanding = outstanding !== null && Number(outstanding) > 0;

  return (
    <div className="space-y-5 sm:space-y-6 max-w-3xl mx-auto pb-8">
      {/* HERO — gradient panel with avatar + greeting + name + plan badge.
          Inspired by Apple Fitness / Strava profile cards: bold name,
          status as the headline metric, gym ID accessible but not loud.
          Gradient draws from emerald (active member = positive) but stays
          subtle so the actual content reads first. */}
      <section
        aria-labelledby="portal-hero-name"
        className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-emerald-500/15 via-card to-card p-5 sm:p-6"
      >
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:text-left gap-4 sm:gap-5">
          <Avatar className="size-16 sm:size-20 rounded-2xl after:rounded-2xl ring-4 ring-emerald-500/10 shrink-0">
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
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm text-muted-foreground">
              {greeting},
            </p>
            <h1
              id="portal-hero-name"
              className="text-xl sm:text-2xl font-semibold leading-tight mt-0.5 truncate"
            >
              {heroName}
            </h1>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
              <StatusPill variant="active">Active member</StatusPill>
              <span className="text-xs text-muted-foreground">
                Since {format(me.createdAt, "MMM yyyy")}
              </span>
            </div>
          </div>
        </div>

        {/* Current plan + days remaining as a compact, prominent strip.
            This IS the answer to "am I OK?" — the most-asked question
            the portal needs to answer at a glance. */}
        {current && (
          <div className="mt-4 sm:mt-5 flex items-start sm:items-center gap-3 rounded-xl bg-card/60 backdrop-blur-sm border px-4 py-3">
            <div className="size-9 rounded-lg bg-sky-500/15 text-sky-500 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <CalendarIcon className="size-4" />
            </div>
            {/* Both label/value pairs share one left edge: stacked on mobile
                (so "Current plan" and "Next due" line up under the icon),
                a justified row on desktop. */}
            <div className="flex-1 min-w-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Current plan
                </p>
                <p className="text-sm font-semibold truncate">
                  {current.planName}
                </p>
              </div>
              <div className="min-w-0 sm:text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {nextPaymentDue ? "Next due" : "Days remaining"}
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {nextPaymentDue
                    ? format(parseISO(nextPaymentDue), "MMM d, yyyy")
                    : `${daysLeft ?? 0} day${daysLeft === 1 ? "" : "s"}`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Gym ID copy widget — tucked into the hero so it's always
            available without taking a row of its own. */}
        {me.gymId !== null && (
          <div className="mt-4 flex justify-center sm:justify-start">
            <GymIdCopy gymId={me.gymId} />
          </div>
        )}
      </section>

      {/* ACTION BANNERS — only render when actionable. Stacking these
          immediately under the hero is the "what should I do today?"
          surface, like banking apps' alert cards or Apple Wallet's
          notifications. */}
      {(hasOutstanding || showRenewalWarning || workoutPlanView) && (
        <div className="space-y-3">
          {hasOutstanding && (
            <div
              role="alert"
              className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3"
            >
              <div className="size-9 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  Outstanding: LKR {Number(outstanding).toLocaleString()}
                </p>
                <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
                  Visit the front desk to settle your dues.
                </p>
              </div>
            </div>
          )}
          {showRenewalWarning && !hasOutstanding && (
            <div
              role="alert"
              className="rounded-xl border border-sky-500/40 bg-sky-50 dark:bg-sky-950/30 p-4 flex items-start gap-3"
            >
              <div className="size-9 rounded-lg bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                <CalendarIcon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">
                  {daysLeft === 0
                    ? "Your membership expires today"
                    : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left on your membership`}
                </p>
                <p className="text-xs text-sky-800/80 dark:text-sky-200/80 mt-0.5">
                  Visit the front desk to renew.
                </p>
              </div>
            </div>
          )}
          {workoutPlanView && workoutPlanView.daysUntilExpiry >= 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                    Your workout plan is ready
                  </p>
                  <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80 mt-0.5 truncate">
                    {workoutPlanView.fileName}
                  </p>
                  {workoutPlanView.daysUntilExpiry <= 1 && (
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-1">
                      {workoutPlanView.daysUntilExpiry === 0
                        ? "Expires today — download now"
                        : "Expires tomorrow"}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-3 sm:mt-0 sm:absolute sm:right-4 sm:top-4 relative sm:relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-initial"
                  render={
                    <a
                      href={workoutPlanView.viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <Eye className="size-4" />
                  View
                </Button>
                <Button
                  size="sm"
                  className="flex-1 sm:flex-initial bg-emerald-500 hover:bg-emerald-600 text-white"
                  render={<a href={workoutPlanView.downloadUrl} />}
                >
                  <Download className="size-4" />
                  Download
                </Button>
              </div>
            </div>
          )}
          {workoutPlanView && workoutPlanView.daysUntilExpiry < 0 && (
            <div className="rounded-xl border bg-card p-4 flex items-start gap-3">
              <div className="size-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                <FileText className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Workout plan expired</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ask your trainer to resend it.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STATS — 2x2 on mobile (compact glanceable grid, Apple Fitness
          rings pattern), 4-col on desktop. */}
      <section aria-label="Membership stats">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            icon={Wallet}
            label="Total paid"
            value={`LKR ${totalPaid.toLocaleString()}`}
            caption="Lifetime"
            accentColor="green"
          />
          <StatCard
            icon={CalendarIcon}
            label="Plan"
            value={current?.planName ?? "—"}
            caption={activeMembershipCaption}
            accentColor="blue"
          />
          <StatCard
            icon={AlertCircle}
            label="Outstanding"
            value={
              hasOutstanding
                ? `LKR ${Number(outstanding).toLocaleString()}`
                : "Settled"
            }
            caption={hasOutstanding ? "Action required" : "All clear"}
            accentColor={hasOutstanding ? "red" : "green"}
          />
          <StatCard
            icon={Activity}
            label="Check-ins"
            value={totalCheckins}
            caption="Lifetime"
            accentColor="amber"
          />
        </div>
      </section>

      {/* RECENT ACTIVITY — feed-style cards with friendly date labels
          (Today / Yesterday / N days ago). Same activity-row pattern
          used by Strava / Apple Fitness. Show-more caps initial render. */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Recent activity</h2>
        <RecentActivity rows={attendanceRows} />
      </section>

      {/* PAYMENT HISTORY — Stripe-style cards: amount as the
          right-aligned eye-anchor, kind+method as muted metadata,
          status pill nested below amount. Show-more caps initial render. */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Payment history</h2>
        <PaymentList rows={paymentRows} />
      </section>
    </div>
  );
}
