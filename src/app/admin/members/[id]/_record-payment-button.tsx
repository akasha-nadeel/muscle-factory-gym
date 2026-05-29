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
          at/past expiry — the wrong-button-wrong-action footgun window. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
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
 * Design intent — iOS / macOS confirmation alert pattern:
 *   - Centered icon to anchor the alert visually
 *   - Headline that names the consequence ("ends today")
 *   - Body that explains WHY this matters in plain language
 *   - Primary CTA = the recommended path (amber Renew)
 *   - Secondary CTA = "Continue with payment" (outline) for rare cases
 *     where admin really does want to record a payment on the dying cycle
 *     (e.g. logging a missed past-due payment)
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
      ? `${plan} has already expired`
      : state === "today"
        ? `${plan} ends today`
        : `${plan} ends tomorrow`;

  return (
    <div className="text-center space-y-4 py-2">
      <div className="mx-auto size-12 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
        <AlertTriangle className="size-6" />
      </div>
      <div className="space-y-1.5">
        <DialogTitle className="text-base font-semibold">
          {headline} — did you mean to renew?
        </DialogTitle>
        <p className="text-sm text-muted-foreground">
          Recording a payment here{" "}
          <span className="font-medium text-foreground">won&apos;t extend</span>{" "}
          the membership. To start a new cycle, use{" "}
          <span className="font-medium text-foreground">Renew membership</span>.
        </p>
      </div>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-center gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onContinue}
          className="sm:flex-initial"
        >
          Continue with payment
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSwitchToRenew}
          className="sm:flex-initial bg-amber-500 hover:bg-amber-600 text-white"
        >
          Open Renew instead
          <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
