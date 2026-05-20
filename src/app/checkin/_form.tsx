"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitGymId, type SubmitGymIdResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  useEffect(() => {
    setRecentIds(loadRecentIds());
  }, []);

  useEffect(() => {
    if (!state) return;
    if (state.ok && state.member.gymId !== null) {
      const idStr = String(state.member.gymId);
      saveRecentId(idStr);
      setRecentIds(loadRecentIds());
    }
    const t = setTimeout(() => {
      formRef.current?.reset();
      setInputValue("");
      inputRef.current?.focus();
    }, RESULT_DISPLAY_MS);
    return () => clearTimeout(t);
  }, [state]);

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
