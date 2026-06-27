"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  previewGymId,
  confirmCheckin,
  type SubmitGymIdResult,
  type CheckinMember,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MemberAvatar } from "@/components/admin/member-avatar";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { TriangleAlert } from "lucide-react";
import { displayName } from "@/lib/profiles/display-name";

const RESULT_DISPLAY_MS = 5000;
// A confirm card left untouched (member walked away) auto-cancels so the
// kiosk frees itself for the next person — it never auto-checks-in.
const CONFIRM_TIMEOUT_MS = 15000;

type RejectReason = Exclude<SubmitGymIdResult, { ok: true }>["reason"];

function rejectMessage(reason: RejectReason): string {
  switch (reason) {
    case "invalid_format":
      return "Please enter a 4-digit Gym ID.";
    case "not_found":
      return "No member found with that Gym ID.";
    case "pending_approval":
      return "Your account is awaiting approval. Please see the front desk.";
    case "inactive":
      return "Your account is inactive. Please see the front desk to reactivate.";
    case "no_active_membership":
      return "Your membership has expired. Please renew at the front desk.";
    case "already_checked_in_today":
      return "Already checked in today. Welcome back!";
    case "db_error":
      return "Couldn't record check-in. Please try again. (E-DB)";
  }
}

type PaymentWarning = {
  fullName: string;
  outstandingLkr: string;
  expiresOn: string;
  nextPaymentDue: string | null;
  lastMissedDue: string | null;
};

export function CheckinForm() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [inputValue, setInputValue] = useState("");

  // Member resolved by step 1, awaiting the member's "Yes, that's me".
  const [pendingMember, setPendingMember] = useState<CheckinMember | null>(null);
  // Post-commit overdue takeover (shown after a successful check-in).
  const [paymentWarning, setPaymentWarning] = useState<PaymentWarning | null>(
    null,
  );

  const [isLooking, startLookup] = useTransition();
  const [isCommitting, startCommit] = useTransition();

  function focusInput() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function resetToInput() {
    setInputValue("");
    setPendingMember(null);
    setPaymentWarning(null);
    focusInput();
  }

  // STEP 1 — look up + evaluate, but DO NOT record. Show the confirm card.
  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const raw = inputValue.trim();
    if (!raw || isLooking) return;
    startLookup(async () => {
      const res = await previewGymId(raw);
      if (res.ok) {
        setPendingMember(res.member);
      } else {
        toast.error(rejectMessage(res.reason), { duration: RESULT_DISPLAY_MS });
        resetToInput();
      }
    });
  }

  // STEP 2 — the member confirmed it's them; commit by resolved memberId.
  function handleConfirm() {
    if (!pendingMember || isCommitting) return;
    const member = pendingMember;
    startCommit(async () => {
      const res = await confirmCheckin(member.memberId);
      if (res.ok) {
        setPendingMember(null);
        finishSuccess(res.member);
      } else {
        setPendingMember(null);
        toast.error(rejectMessage(res.reason), { duration: RESULT_DISPLAY_MS });
        resetToInput();
      }
    });
  }

  function finishSuccess(member: CheckinMember) {
    const isOverdue = Number(member.outstandingLkr) > 0;
    if (isOverdue) {
      // Suppress the success toast — the full-page warning is louder and
      // serves the same "you're checked in" purpose.
      setInputValue("");
      setPaymentWarning({
        fullName: member.fullName,
        outstandingLkr: member.outstandingLkr,
        expiresOn: member.expiresOn,
        nextPaymentDue: member.nextPaymentDue,
        lastMissedDue: member.lastMissedDue,
      });
      return;
    }
    const days = member.daysRemaining;
    toast.success(`Welcome, ${displayName(member.fullName)}`, {
      description: `${member.planName} — ${days} day${
        days === 1 ? "" : "s"
      } remaining`,
      duration: RESULT_DISPLAY_MS,
    });
    setTimeout(resetToInput, RESULT_DISPLAY_MS);
  }

  // Auto-cancel an unconfirmed card (walk-away). Paused while committing so a
  // slow round-trip can't yank the card out from under a tapped confirm.
  useEffect(() => {
    if (!pendingMember || isCommitting) return;
    const t = setTimeout(resetToInput, CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [pendingMember, isCommitting]);

  function closeWarning() {
    resetToInput();
  }

  return (
    <div className="space-y-4">
      {/* STEP 2 — confirm-before-commit identity card. Nothing is written
          until the member taps "Yes, check me in", so a mistyped Gym ID
          can't mark the wrong member present. */}
      {pendingMember && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 text-zinc-50 p-6 text-center animate-in fade-in-0 zoom-in-95 duration-200">
          <p className="text-sm sm:text-base uppercase tracking-[0.2em] text-zinc-400 mb-6">
            Please confirm
          </p>
          <MemberAvatar
            fullName={pendingMember.fullName}
            photoUrl={pendingMember.photoUrl}
            size="lg"
            className="size-32 sm:size-40 mb-6 ring-2 ring-zinc-700"
            fallbackClassName="text-5xl sm:text-6xl font-semibold"
          />
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-2">
            {displayName(pendingMember.fullName)}
          </h1>
          <p className="text-lg sm:text-2xl text-zinc-300">
            {pendingMember.planName} — {pendingMember.daysRemaining} day
            {pendingMember.daysRemaining === 1 ? "" : "s"} left
          </p>
          {pendingMember.gymId != null && (
            <p className="text-sm sm:text-base text-zinc-500 mt-1">
              Gym ID {pendingMember.gymId}
            </p>
          )}
          <p className="text-base sm:text-lg text-zinc-400 max-w-md mt-6 mb-8">
            Is this you? Tap{" "}
            <span className="font-semibold text-zinc-200">Yes</span> to check
            in. If it isn&apos;t, tap{" "}
            <span className="font-semibold text-zinc-200">Not me</span> and
            re-enter your Gym ID.
          </p>
          <div className="flex w-full max-w-md flex-col-reverse sm:flex-row gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={resetToInput}
              disabled={isCommitting}
              className="h-14 flex-1 text-base border-zinc-600 bg-transparent text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50"
            >
              Not me
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={handleConfirm}
              disabled={isCommitting}
              className="h-14 flex-1 text-base bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-600"
            >
              {isCommitting ? "Checking in…" : "Yes, check me in"}
            </Button>
          </div>
        </div>
      )}

      {paymentWarning && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 text-zinc-50 p-6 text-center">
          <TriangleAlert
            className="size-20 sm:size-28 mb-6 text-destructive"
            strokeWidth={1.5}
          />
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-4 text-destructive">
            PAYMENT DUE
          </h1>
          <p className="text-xl sm:text-3xl font-semibold text-zinc-50 mb-6">
            Hi, {displayName(paymentWarning.fullName)}
          </p>
          {(() => {
            // Prefer the actual missed due date; fall back to next-due or end-date.
            const displayDate =
              paymentWarning.lastMissedDue ??
              paymentWarning.nextPaymentDue ??
              paymentWarning.expiresOn;
            const todayStr = format(new Date(), "yyyy-MM-dd");
            const isToday = displayDate === todayStr;
            return (
              <>
                <p className="text-lg sm:text-2xl text-zinc-300 mb-3">
                  {isToday
                    ? "Your payment is due today"
                    : "Your payment was due on"}
                </p>
                <div className="text-3xl sm:text-5xl font-semibold mb-8 text-zinc-50">
                  {format(parseISO(displayDate), "EEEE, MMM d, yyyy")}
                </div>
              </>
            );
          })()}
          <p className="text-base sm:text-lg text-zinc-400 max-w-xl mb-10">
            You&apos;re checked in today. Please visit the front desk to renew
            your membership.
          </p>
          <Button
            type="button"
            onClick={closeWarning}
            size="lg"
            className="h-12 px-8 text-base"
          >
            Close
          </Button>
        </div>
      )}

      <form onSubmit={handleLookup} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="gymId" className="text-base">
            Enter Your Gym ID:
          </Label>
          <Input
            id="gymId"
            name="gymId"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="eg : 1234"
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="h-14 text-lg"
          />
        </div>
        <Button
          type="submit"
          disabled={isLooking}
          className="w-full h-12 text-base"
        >
          {isLooking ? "Checking…" : "Submit"}
        </Button>
      </form>
    </div>
  );
}
