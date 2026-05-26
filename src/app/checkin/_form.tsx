"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitGymId, type SubmitGymIdResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { TriangleAlert } from "lucide-react";
import { displayName } from "@/lib/profiles/display-name";

const RESULT_DISPLAY_MS = 5000;
const RECENT_IDS_KEY = "gym-checkin-recent-ids";
const MAX_RECENT_IDS = 5;

function loadRecentIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function saveRecentId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadRecentIds();
    const next = [id, ...current.filter((x) => x !== id)].slice(
      0,
      MAX_RECENT_IDS,
    );
    window.localStorage.setItem(RECENT_IDS_KEY, JSON.stringify(next));
  } catch {
    // localStorage quota / private mode — non-fatal
  }
}

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

  // Per-device recent gym IDs (localStorage). No DB lookup — only IDs that
  // were *successfully* used on THIS device appear, so no member list leak.
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [paymentWarning, setPaymentWarning] = useState<{
    fullName: string;
    outstandingLkr: string;
    expiresOn: string;
    nextPaymentDue: string | null;
    lastMissedDue: string | null;
  } | null>(null);

  useEffect(() => {
    setRecentIds(loadRecentIds());
  }, []);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      const outstanding = Number(state.member.outstandingLkr);
      // Cycle-aware outstanding: it's 0 for a member who's paid up for
      // the current cycle, and goes back up to one cycle's price on each
      // due day they haven't paid. So any outstanding > 0 means they're
      // behind for at least one cycle — fire the warning.
      const isOverdue = outstanding > 0;

      if (isOverdue) {
        // Suppress the success toast — the full-page warning is louder
        // and serves the same "you're checked in" purpose.
        setPaymentWarning({
          fullName: state.member.fullName,
          outstandingLkr: state.member.outstandingLkr,
          expiresOn: state.member.expiresOn,
          nextPaymentDue: state.member.nextPaymentDue,
          lastMissedDue: state.member.lastMissedDue,
        });
      } else {
        const days = state.member.daysRemaining;
        toast.success(`Welcome, ${displayName(state.member.fullName)}`, {
          description: `${state.member.planName} — ${days} day${
            days === 1 ? "" : "s"
          } remaining`,
          duration: RESULT_DISPLAY_MS,
        });
      }
      if (state.member.gymId !== null) {
        saveRecentId(String(state.member.gymId));
        setRecentIds(loadRecentIds());
      }
    } else {
      toast.error(rejectMessage(state.reason), {
        duration: RESULT_DISPLAY_MS,
      });
    }
    const isOverdueWarning =
      state.ok && Number(state.member.outstandingLkr) > 0;

    // The payment warning is dismissed manually by the member tapping
    // Close. The toast paths auto-dismiss as before.
    if (isOverdueWarning) return;

    const t = setTimeout(() => {
      formRef.current?.reset();
      setInputValue("");
      inputRef.current?.focus();
    }, RESULT_DISPLAY_MS);
    return () => clearTimeout(t);
  }, [state]);

  function closeWarning() {
    setPaymentWarning(null);
    formRef.current?.reset();
    setInputValue("");
    inputRef.current?.focus();
  }

  const suggestions = recentIds.filter(
    (id) => inputValue.length === 0 || id.startsWith(inputValue),
  );
  const showDropdown = focused && suggestions.length > 0 && !state;

  function selectSuggestion(id: string) {
    setInputValue(id);
    setFocused(false);
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-4">
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
            You&apos;re checked in today. Please visit the front desk to
            renew your membership.
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
      <form action={dispatch} ref={formRef} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="gymId" className="text-base">
            Enter Your Gym ID:
          </Label>
          <div className="relative">
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
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              className="h-14 text-lg"
            />
            {showDropdown && (
              <ul
                role="listbox"
                aria-label="Recent gym IDs"
                className="absolute z-10 left-0 right-0 mt-1 rounded-md border bg-popover text-popover-foreground shadow-md overflow-hidden"
              >
                <li className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground border-b">
                  Recently used on this device
                </li>
                {suggestions.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        // onMouseDown fires before onBlur, so the click
                        // registers even though the input is about to blur.
                        e.preventDefault();
                        selectSuggestion(id);
                      }}
                      className="w-full text-left px-3 py-2.5 font-mono text-base hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      #{id}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="w-full h-12 text-base"
        >
          {pending ? "Checking…" : "Submit"}
        </Button>
      </form>
    </div>
  );
}
