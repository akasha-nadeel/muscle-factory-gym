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
  CalendarClock, Sparkles, AlertTriangle,
} from "lucide-react";
import { StatCard } from "@/components/admin/stat-card";
import { StatusPill } from "@/components/admin/status-pill";
import { GymIdCopy } from "@/components/admin/gym-id-copy";
import { getCurrentMembership } from "@/lib/memberships/current";
import { daysRemaining } from "@/lib/days-remaining";
import { todayInSL } from "@/lib/tz";
import { RecentActivity } from "./_recent-activity";
import { PaymentList } from "./_payment-list";
import { EditProfileButton } from "./_edit-profile";
import { HeroAvatar } from "./_hero-avatar";
import { computeOutstanding } from "@/lib/payments/outstanding";
import {
  inferCyclePeriod,
  computeNextPaymentDue,
} from "@/lib/payments/next-due";
import { parseISO } from "date-fns";
import { signedWorkoutPlanUrl } from "@/lib/storage/supabase-storage";
import { displayName } from "@/lib/profiles/display-name";
import { normalizeAvatarUrl } from "@/lib/profiles/photo";

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

  // Whole days from today until that next payment is due (clamped at 0).
  const daysToNextPayment =
    nextPaymentDue != null
      ? Math.max(0, daysRemaining({ today, endDate: nextPaymentDue }))
      : null;

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
      {/* HERO — horizontal profile card (reference layout): avatar with a
          camera badge on the left; name, email, membership status, and a
          green "Edit profile" CTA on the right. The camera badge uploads a
          photo directly; the button opens the full editor. */}
      <section aria-labelledby="portal-hero-name" className="pt-2">
        <p className="text-xs sm:text-sm text-muted-foreground mb-3">
          {greeting},
        </p>
        <div className="flex items-center gap-4 sm:gap-5">
          {/* Client avatar: camera badge does a direct upload with an
              on-image spinner + optimistic preview (no initials flash). */}
          <HeroAvatar name={heroName} imageUrl={avatarUrl} />
          <div className="min-w-0 flex-1">
            <h1
              id="portal-hero-name"
              className="text-xl sm:text-2xl font-semibold leading-tight truncate"
            >
              {heroName}
            </h1>
            <p className="text-sm text-muted-foreground truncate">
              {me.email}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {/* Drive the pill from real membership state. `current` is
                  null when the member has no active plan, so the badge
                  switches from green "Active member" to "No active plan"
                  the moment the admin cancels. */}
              {current ? (
                <StatusPill variant="active">Active member</StatusPill>
              ) : (
                <StatusPill variant="inactive">No active plan</StatusPill>
              )}
              <span className="text-xs text-muted-foreground">
                Since {format(me.createdAt, "MMM yyyy")}
              </span>
            </div>
            {/* Opens the full editor (photo + name + phone). */}
            <EditProfileButton initialPhone={me.phone ?? ""} />
          </div>
        </div>
        {me.gymId !== null && (
          <div className="mt-5 flex justify-center">
            <GymIdCopy gymId={me.gymId} />
          </div>
        )}
      </section>

      {/* Plan card — the membership's headline info, elevated to match the
          stat/payment cards: a sky-tinted gradient surface, a solid icon
          tile, a prominent plan name, and a divided "next due" row. */}
      {current && (
        <div className="rounded-2xl border bg-gradient-to-br from-violet-500/10 via-card to-card p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-500 text-white shadow-sm">
              <CalendarIcon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                Membership
              </p>
              <p className="truncate text-lg font-semibold leading-tight">
                {current.planName}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-3.5">
            <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="size-3.5" />
              {nextPaymentDue ? "Next due" : "Days remaining"}
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {nextPaymentDue
                ? format(parseISO(nextPaymentDue), "MMM d, yyyy")
                : `${daysLeft ?? 0} day${daysLeft === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>
      )}

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
            variant="stack"
            icon={Wallet}
            label="Total paid"
            value={`LKR ${totalPaid.toLocaleString()}`}
            accentColor="green"
          />
          <StatCard
            variant="stack"
            icon={CalendarIcon}
            label="Plan"
            value={
              daysToNextPayment == null
                ? "—"
                : daysToNextPayment === 0
                  ? "Due today"
                  : `Due in ${daysToNextPayment}d`
            }
            accentColor="blue"
          />
          <StatCard
            variant="stack"
            icon={AlertCircle}
            label="Outstanding"
            value={
              hasOutstanding
                ? `LKR ${Number(outstanding).toLocaleString()}`
                : "Settled"
            }
            accentColor={hasOutstanding ? "red" : "green"}
          />
          <StatCard
            variant="stack"
            icon={Activity}
            label="Check-ins"
            value={totalCheckins}
            accentColor="amber"
          />
        </div>
      </section>

      {/* RECENT ACTIVITY — feed-style cards with friendly date labels
          (Today / Yesterday / N days ago). Same activity-row pattern
          used by Strava / Apple Fitness. Show-more caps initial render. */}
      <section>
        <RecentActivity rows={attendanceRows} title="Recent activity" />
      </section>

      {/* PAYMENT HISTORY — Stripe-style cards: amount as the
          right-aligned eye-anchor, kind+method as muted metadata,
          status pill nested below amount. Show-more caps initial render. */}
      <section>
        <PaymentList rows={paymentRows} title="Payment history" />
      </section>
    </div>
  );
}
