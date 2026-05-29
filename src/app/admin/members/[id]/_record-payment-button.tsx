"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemberAvatar } from "@/components/admin/member-avatar";
import { RecordPaymentForm } from "@/components/admin/record-payment-form";
import { displayName } from "@/lib/profiles/display-name";
import { todayInSL } from "@/lib/tz";

/** Days threshold — at/under this the wrong action is almost certainly
 *  Record Payment vs Renew. Beyond gives normal mid-cycle runway. */
const RENEW_NUDGE_DAYS = 2;

type RenewState = "expired" | "today" | "tomorrow" | null;

/**
 * Decide whether to show the upfront "did you mean to renew?" pop-up.
 * Targets the high-damage case where admin records a payment thinking it
 * extends the plan, but it just logs against a cycle that's about to die.
 */
function renewState(currentEndDate: string | null): RenewState {
  if (!currentEndDate) return null;
  const today = todayInSL();
  if (currentEndDate < today) return "expired";
  if (currentEndDate === today) return "today";
  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  const tomorrowStr = `${tomorrow.getUTCFullYear()}-${String(
    tomorrow.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;
  if (currentEndDate === tomorrowStr) return "tomorrow";
  const diffDays = Math.round(
    (new Date(`${currentEndDate}T00:00:00Z`).getTime() -
      new Date(`${today}T00:00:00Z`).getTime()) /
      (24 * 60 * 60 * 1000),
  );
  return diffDays <= RENEW_NUDGE_DAYS ? "tomorrow" : null;
}

export function RecordPaymentButton({
  memberId,
  memberName,
  memberPhotoUrl,
  memberGymId,
  memberPlanName,
  currentMembershipId,
  currentEndDate,
}: {
  memberId: string;
  memberName: string;
  memberPhotoUrl?: string | null;
  memberGymId?: number | null;
  memberPlanName?: string | null;
  currentMembershipId: string | null;
  /** YYYY-MM-DD; null when member has no active membership. */
  currentEndDate?: string | null;
}) {
  // Two-stage dialog: an optional safeguard confirmation, then the actual
  // Record Payment form. Both are independent Dialog instances so the
  // back-button / Escape keystrokes feel right and there's no weird nested
  // modal behavior.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const safeguard = renewState(currentEndDate ?? null);

  function handleTriggerClick() {
    // Only confirm when the active plan is at/past expiry. Mid-cycle
    // payments (most of the time) skip the dialog and open the form
    // directly so the safeguard doesn't become an annoyance.
    if (safeguard) {
      setConfirmOpen(true);
    } else {
      setFormOpen(true);
    }
  }

  function handleConfirmContinue() {
    setConfirmOpen(false);
    setFormOpen(true);
  }

  function handleSwitchToRenew() {
    setConfirmOpen(false);
    // Decoupled cross-dialog trigger — the Renew button on the same page
    // listens for this event and opens its dialog.
    window.dispatchEvent(new CustomEvent("mfg:open-renew-dialog"));
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handleTriggerClick}
        className="bg-foreground/[0.80] hover:bg-foreground/[0.90] text-background hover:text-background dark:bg-foreground/[0.06] dark:hover:bg-foreground/[0.12] dark:text-foreground dark:hover:text-foreground"
      >
        Record payment
      </Button>

      {/* Safeguard confirmation pop-up. Shown when the active membership is
          at/past expiry — the wrong-button-wrong-action footgun window.
          Hero card design — colored wave top, floating icon at the dip,
          centered headline + pill action buttons. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          className="p-0 overflow-hidden gap-0 sm:max-w-md border-0"
          showCloseButton={false}
        >
          {safeguard && (
            <RenewSafeguardContent
              state={safeguard}
              planName={memberPlanName ?? null}
              onContinue={handleConfirmContinue}
              onSwitchToRenew={handleSwitchToRenew}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Record Payment form dialog — unchanged. */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>

          {/* Recipient identity strip — matches the Send Workout Plan and
              Approve Member dialogs so all three feel like one product. */}
          <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
            <MemberAvatar
              fullName={memberName}
              photoUrl={memberPhotoUrl ?? null}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">
                {displayName(memberName)}
              </div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                {memberGymId !== null && memberGymId !== undefined && (
                  <span className="font-mono">#{memberGymId}</span>
                )}
                {memberPlanName && <span>{memberPlanName}</span>}
              </div>
            </div>
          </div>

          <RecordPaymentForm
            memberId={memberId}
            currentMembershipId={currentMembershipId}
            successToastName={displayName(memberName)}
            onSuccess={() => setFormOpen(false)}
            onCancel={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Content of the renewal-safeguard confirmation pop-up.
 *
 * Design — hero alert card pattern (inspired by mobile-app confirmation
 * UIs that lead with a strong color block and floating icon):
 *   - Amber gradient top section with a wavy "smile" curve at the bottom
 *   - White circle holding the AlertTriangle icon, straddling the curve's
 *     dip apex — visually anchors the alert and connects the two sections
 *   - Centered headline (amber color) that names the consequence
 *   - Plain-language body explaining the why
 *   - Two pill buttons at the bottom:
 *       primary (amber, recommended) = Open Renew
 *       secondary (outline) = Continue with payment (for edge cases)
 */
function RenewSafeguardContent({
  state,
  planName,
  onContinue,
  onSwitchToRenew,
}: {
  state: "expired" | "today" | "tomorrow";
  planName: string | null;
  onContinue: () => void;
  onSwitchToRenew: () => void;
}) {
  const plan = planName ?? "Membership";
  const headline =
    state === "expired"
      ? `${plan} expired`
      : state === "today"
        ? `${plan} ends today!`
        : `${plan} ends tomorrow`;

  return (
    <>
      {/* Required for a11y — visually hidden because we render our own headline. */}
      <DialogTitle className="sr-only">
        {headline} — did you mean to renew?
      </DialogTitle>

      {/* Wave top — single SVG with amber-gradient fill and a smile curve
          at the bottom. The path dips at the center where the icon will sit. */}
      <div className="relative">
        <svg
          viewBox="0 0 400 130"
          preserveAspectRatio="none"
          className="block w-full h-28"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="renewSafeguardGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
          <path
            fill="url(#renewSafeguardGrad)"
            d="M 0,0 L 400,0 L 400,95 C 290,95 230,95 215,115 Q 200,130 185,115 C 170,95 110,95 0,95 Z"
          />
        </svg>
        {/* Icon circle — centered on the dip apex (SVG bottom-center).
            Half overlaps the amber zone, half hangs into the body. */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 size-20 rounded-full bg-popover flex items-center justify-center shadow-md ring-2 ring-amber-500/30"
          style={{ top: "100%" }}
        >
          <AlertTriangle
            className="size-10 text-amber-500"
            strokeWidth={2.5}
          />
        </div>
      </div>

      {/* Body — padded above to clear the floating icon. */}
      <div className="px-6 pt-14 pb-6 text-center">
        <h2 className="text-xl font-bold text-amber-600 dark:text-amber-400 tracking-tight">
          {headline}
        </h2>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1.5">
          Did you mean to renew?
        </p>
        <p className="text-sm text-muted-foreground mt-3 max-w-sm mx-auto leading-relaxed">
          Recording a payment here{" "}
          <span className="font-medium text-foreground">won&apos;t extend</span>{" "}
          the membership. To start a new cycle, use{" "}
          <span className="font-medium text-foreground">Renew membership</span>{" "}
          instead.
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 justify-center mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={onContinue}
            className="rounded-full px-5 sm:flex-initial border-foreground/20 hover:border-foreground/40 text-foreground"
          >
            Continue with payment
          </Button>
          <Button
            type="button"
            onClick={onSwitchToRenew}
            className="rounded-full px-5 sm:flex-initial bg-amber-500 hover:bg-amber-600 text-white shadow-md"
          >
            Open Renew
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </>
  );
}
