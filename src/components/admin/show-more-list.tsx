"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Progressive-disclosure wrapper for long lists. Renders only the first
 * `initialCount` children; reveals the rest behind a "Show all (N)" /
 * "Show less" toggle. Works for any list — mobile cards, desktop table
 * rows, vertical or horizontal — because it just slices children.
 *
 * Used on the member-detail page for Payments / Attendance / Membership
 * history sections so a member with 50+ entries doesn't force the admin
 * to scroll forever. Same pattern Twitter / Reddit / GitHub all use for
 * activity feeds.
 *
 * Note: server-driven pagination would be more scalable for 1000+ rows,
 * but for a single-gym dataset (usually <100 per section) the cost of
 * shipping all rows is tiny compared to the UX of having one place to
 * see them all.
 */
export function ShowMoreList({
  children,
  initialCount = 5,
  itemLabel = "items",
}: {
  /** All list items as a React array. Pass `Array.children` already mapped. */
  children: ReactNode[];
  /** How many items to show before the toggle. */
  initialCount?: number;
  /** Plural noun used in the button label, e.g. "payments". */
  itemLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = children.length;
  const showToggle = total > initialCount;
  const visible = expanded ? children : children.slice(0, initialCount);

  return (
    <>
      {visible}
      {showToggle && (
        <div className="flex justify-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((e) => !e)}
            className="text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-4" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="size-4" />
                Show all {total} {itemLabel}
              </>
            )}
          </Button>
        </div>
      )}
    </>
  );
}
