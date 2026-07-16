"use client";

import { cn } from "@/lib/utils";

export type RangeKey = "today" | "week" | "month";

/** Epoch-ms start thresholds for each range, computed server-side in
 *  Sri Lanka time so client-side filtering matches the gym's calendar. */
export type RangeStarts = Record<RangeKey, number>;

const labels: Record<RangeKey, string> = {
  today: "Today",
  week: "Week",
  month: "Month",
};

/**
 * Controlled Today/Week/Month toggle. Unlike the old URL-navigating version,
 * this flips local state so the parent panel can re-filter already-loaded
 * rows instantly — no route navigation, no server round-trip, no re-query.
 */
export function RangeToggle({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (k: RangeKey) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md bg-muted/40 p-0.5 text-xs">
      {(Object.keys(labels) as RangeKey[]).map((k) => {
        const active = k === value;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            aria-pressed={active}
            className={cn(
              "px-2.5 py-1 rounded-[5px] transition-colors",
              active
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {labels[k]}
          </button>
        );
      })}
    </div>
  );
}
