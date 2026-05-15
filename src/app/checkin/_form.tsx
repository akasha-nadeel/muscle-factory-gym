"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitGymId, type SubmitGymIdResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RESULT_DISPLAY_MS = 5000;

function rejectMessage(
  reason: Exclude<SubmitGymIdResult, { ok: true }>["reason"],
): string {
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

export function CheckinForm() {
  const [state, dispatch, pending] = useActionState<
    SubmitGymIdResult | undefined,
    FormData
  >(submitGymId, undefined);
  const formRef = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => {
      formRef.current?.reset();
      inputRef.current?.focus();
    }, RESULT_DISPLAY_MS);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <div className="space-y-4">
      <form action={dispatch} ref={formRef} className="space-y-3">
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
            className="h-14 text-lg"
          />
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="w-full h-12 text-base"
        >
          {pending ? "Checking…" : "Submit"}
        </Button>
      </form>

      {state?.ok && (
        <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-center space-y-1">
          <div className="text-green-700 dark:text-green-300 text-lg font-semibold">
            ✓ Welcome, {state.member.fullName}
          </div>
          <div className="text-sm text-muted-foreground">
            {state.member.planName} — {state.member.daysRemaining} day
            {state.member.daysRemaining === 1 ? "" : "s"} remaining
          </div>
        </div>
      )}

      {state && !state.ok && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center">
          <div className="text-destructive font-medium">
            {rejectMessage(state.reason)}
          </div>
        </div>
      )}
    </div>
  );
}
