"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useOptimistic, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useNavPending } from "./_nav-pending";

const STATUS_OPTIONS = [
  { v: "all", label: "All" },
  { v: "active", label: "Active" },
  { v: "pending", label: "Pending" },
  { v: "inactive", label: "Inactive" },
] as const;

export function MemberFilters({
  status,
  q,
}: {
  status: "pending" | "active" | "inactive" | undefined;
  q: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [text, setText] = useState(q);
  // Shared transition state with the list area below — pending here also
  // dims+spinners the list, giving the user a clear "we're loading" cue
  // while the new server-rendered page is in flight.
  const { pending, startTransition } = useNavPending();
  // Optimistic active state. Without this, the segmented control feels
  // sluggish — it has to wait for a server round-trip + RSC re-render
  // before the highlighted segment moves. With useOptimistic, the active
  // segment shifts instantly on click and React auto-reverts if the
  // navigation fails.
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(
    status ?? "all",
    (_current, next: string) => next,
  );
  const currentStatus = optimisticStatus;

  function update(next: { status?: string | null; q?: string | null }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.status !== undefined) {
      if (next.status === null || next.status === "all") params.delete("status");
      else params.set("status", next.status);
    }
    if (next.q !== undefined) {
      if (!next.q) params.delete("q");
      else params.set("q", next.q);
    }
    params.delete("page"); // reset to page 1
    startTransition(() => {
      // Call setOptimisticStatus INSIDE startTransition so React knows to
      // hold the optimistic value until the transition completes, then
      // swap to the real prop-derived value with no flicker.
      if (next.status !== undefined) {
        const optimisticNext =
          next.status === null || next.status === "all" ? "all" : next.status;
        setOptimisticStatus(optimisticNext);
      }
      const qs = params.toString();
      router.push(qs ? `/admin/members?${qs}` : "/admin/members");
    });
  }

  return (
    <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-row sm:gap-3 sm:items-center">
      {/* Mobile: segmented control. One-tap status filter beats a dropdown
          on touch — iOS Health / Stripe Dashboard / Linear all use this
          for ≤4 mutually-exclusive options.
          Active segment uses inverted colors (bg-foreground / text-background)
          so it's high-contrast in BOTH themes: black-bg-white-text in light
          mode, white-bg-black-text in dark mode. Matches the dark "Edit"
          button pattern used elsewhere in the admin. */}
      <div
        role="tablist"
        aria-label="Filter by status"
        className="sm:hidden grid grid-cols-4 gap-1 p-1 rounded-lg bg-muted/50 border"
      >
        {STATUS_OPTIONS.map((opt) => {
          const active = currentStatus === opt.v;
          return (
            <button
              key={opt.v}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => update({ status: opt.v })}
              disabled={pending}
              className={cn(
                "px-2 py-1.5 text-xs font-medium rounded-md transition-all",
                active
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Desktop: dropdown — table layout has horizontal space to spare,
          and the dropdown keeps the filter compact next to search. */}
      <div className="hidden sm:block">
        <Select
          value={currentStatus}
          onValueChange={(v) => update({ status: v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <form
        className="flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: text });
        }}
      >
        <Input
          type="search"
          placeholder="Search name or email…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending}
        />
      </form>
    </div>
  );
}
