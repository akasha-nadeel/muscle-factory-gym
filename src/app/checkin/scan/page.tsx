import Link from "next/link";
import { format } from "date-fns";
import { CheckCircle2, AlertCircle, ShieldAlert, Clock } from "lucide-react";
import { requireMemberProfile } from "@/lib/auth";
import { verifyKioskToken } from "@/lib/qr/token";
import { _recordAttendanceByMemberIdUnsafe } from "@/lib/checkin/record";
import { todayInSL } from "@/lib/tz";
import { MemberAvatar } from "@/components/admin/member-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// QR rotates every 5 minutes; allow a small grace for clock skew so members
// who scan right at the rotation boundary don't get spurious expiries.
const MAX_TOKEN_AGE_SECONDS = 5 * 60 + 60;

export const dynamic = "force-dynamic";

type SearchParams = { t?: string };

function rejectMessage(reason: string): string {
  switch (reason) {
    case "not_found":
      return "We couldn't find your member profile. Please see the front desk.";
    case "pending_approval":
      return "Your account is awaiting approval. Please see the front desk.";
    case "inactive":
      return "Your account is inactive. Please see the front desk to reactivate.";
    case "no_active_membership":
      return "Your membership has expired. Please renew at the front desk.";
    case "already_checked_in_today":
      return "You've already checked in today. Welcome back!";
    case "db_error":
      return "Couldn't record check-in. Please try again. (E-DB)";
    default:
      return "Something went wrong. Please try again.";
  }
}

function tokenErrorMessage(reason: string): string {
  switch (reason) {
    case "token_expired":
      return "This QR has expired. Please scan a fresh QR at the gym kiosk.";
    case "token_future":
      return "QR timestamp is in the future — the kiosk clock may be wrong.";
    case "invalid_signature":
      return "QR signature didn't verify. Please use the kiosk QR.";
    case "malformed":
      return "QR contents are malformed. Please scan the kiosk QR directly.";
    default:
      return "QR couldn't be verified. Please scan a fresh QR at the gym kiosk.";
  }
}

function ResultShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-5">{children}</CardContent>
      </Card>
    </main>
  );
}

function StatusIcon({
  Icon,
  variant,
}: {
  Icon: typeof CheckCircle2;
  variant: "success" | "warning" | "danger";
}) {
  const bg = {
    success: "bg-status-success-bg text-status-success",
    warning: "bg-status-warning-bg text-status-warning",
    danger: "bg-status-danger-bg text-status-danger",
  }[variant];
  return (
    <div
      className={`mx-auto size-14 rounded-full flex items-center justify-center ${bg}`}
    >
      <Icon className="size-7" />
    </div>
  );
}

export default async function CheckinScanPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  // Step 1 — identity. Middleware has already forced sign-in for /checkin/scan.
  // requireMemberProfile handles the stale-session-claim case via DB fallback.
  const profile = await requireMemberProfile();

  // Step 2 — admins should not be checking in via the kiosk QR.
  if (profile.role === "admin") {
    return (
      <ResultShell>
        <StatusIcon Icon={ShieldAlert} variant="warning" />
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">Admins can&apos;t check in</h1>
          <p className="text-sm text-muted-foreground">
            This page is for members only. You&apos;re signed in as an admin.
          </p>
        </div>
        <Button className="w-full" render={<Link href="/admin" />}>
          Back to admin dashboard
        </Button>
      </ResultShell>
    );
  }

  // Step 3 — verify the kiosk token.
  const rawToken = sp.t ?? "";
  const secret = process.env.QR_SECRET;
  if (!rawToken || !secret) {
    return (
      <ResultShell>
        <StatusIcon Icon={AlertCircle} variant="danger" />
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">Missing QR token</h1>
          <p className="text-sm text-muted-foreground">
            Scan the kiosk QR with your phone camera to check in.
          </p>
        </div>
        <Button variant="outline" className="w-full" render={<Link href="/portal" />}>
          Back to portal
        </Button>
      </ResultShell>
    );
  }

  const verified = await verifyKioskToken({
    token: rawToken,
    now: new Date(),
    secret,
    maxAgeSeconds: MAX_TOKEN_AGE_SECONDS,
  });
  if (!verified.ok) {
    return (
      <ResultShell>
        <StatusIcon Icon={Clock} variant="warning" />
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">Expired QR code</h1>
          <p className="text-sm text-muted-foreground">
            {tokenErrorMessage(verified.reason)}
          </p>
        </div>
        <Button variant="outline" className="w-full" render={<Link href="/portal" />}>
          Back to portal
        </Button>
      </ResultShell>
    );
  }

  // Step 4 — record attendance.
  const result = await _recordAttendanceByMemberIdUnsafe({
    memberId: profile.id,
    todaySL: todayInSL(),
    source: "qr_scan",
  });

  if (!result.ok) {
    // already_checked_in_today is the warm-fuzzy case, others are colder
    const isWarm = result.reason === "already_checked_in_today";
    return (
      <ResultShell>
        <StatusIcon
          Icon={isWarm ? CheckCircle2 : AlertCircle}
          variant={isWarm ? "success" : "danger"}
        />
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">
            {isWarm ? "Welcome back!" : "Couldn't check in"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {rejectMessage(result.reason)}
          </p>
        </div>
        <Button variant="outline" className="w-full" render={<Link href="/portal" />}>
          Back to portal
        </Button>
      </ResultShell>
    );
  }

  // Step 5 — success.
  const member = result.member;
  return (
    <ResultShell>
      <StatusIcon Icon={CheckCircle2} variant="success" />
      <div className="flex flex-col items-center gap-3">
        <MemberAvatar
          size="lg"
          fullName={member.fullName}
          photoUrl={profile.photoUrl}
        />
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">
            Welcome, {member.fullName.split(" ")[0]}!
          </h1>
          <p className="text-sm text-muted-foreground">
            Checked in at {format(new Date(), "HH:mm")} ·{" "}
            <span className="font-mono">#{member.gymId}</span>
          </p>
        </div>
      </div>
      <div className="rounded-lg border bg-muted/30 px-4 py-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Plan
          </div>
          <div className="font-medium mt-0.5">{member.planName}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Days remaining
          </div>
          <div className="font-medium tabular-nums mt-0.5">
            {member.daysRemaining}
          </div>
        </div>
      </div>
      <Button variant="outline" className="w-full" render={<Link href="/portal" />}>
        Back to portal
      </Button>
    </ResultShell>
  );
}
