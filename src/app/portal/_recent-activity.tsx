"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { formatSLDate, formatSLTime } from "@/lib/tz";
import { cn } from "@/lib/utils";

const INITIAL_VISIBLE = 5;

type AttendanceRow = {
  id: string;
  checkedInAt: Date;
  source: "qr_scan" | "manual" | "kiosk_id";
};

function sourceLabel(s: AttendanceRow["source"]): string {
  if (s === "kiosk_id") return "Kiosk";
  if (s === "qr_scan") return "QR scan";
  return "Manual";
}

// A distinct tinted pill per check-in source so they read apart at a glance.
const sourceStyle: Record<AttendanceRow["source"], string> = {
  qr_scan: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  kiosk_id: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  manual: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

/**
 * Friendly relative date label: "Today" / "Yesterday" / "Mar 15, 2026".
 * Members understand "Today / Yesterday" faster than calendar dates;
 * full date is reserved for older entries where relative loses meaning.
 * Mirrors WhatsApp / Instagram / iOS Messages date-label conventions.
 */
function friendlyDate(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = today.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatSLDate(date);
}

export function RecentActivity({
  rows,
  title,
}: {
  rows: AttendanceRow[];
  title: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = rows.length > INITIAL_VISIBLE;
  const visible =
    expanded || !hasMore ? rows : rows.slice(0, INITIAL_VISIBLE);

  return (
    <div>
      {/* Section header with a reference-style "View all" that expands the
          list in place. Only shown when there's more than the initial set. */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-sm font-medium text-sky-400 transition-colors hover:text-sky-300"
          >
            {expanded ? "Show less" : "View all"}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card px-4 py-8 text-center">
          <div className="size-12 rounded-full bg-muted/50 text-muted-foreground inline-flex items-center justify-center mb-3">
            <CheckCircle2 className="size-6" />
          </div>
          <p className="text-sm font-medium">No check-ins yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            Type your Gym ID at the front-desk kiosk to mark your first
            attendance.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((r) => (
            <div
              key={r.id}
              className="relative rounded-xl border bg-card p-3 pl-5"
            >
              {/* Left accent bar (reference style) — emerald for a check-in. */}
              <span
                aria-hidden
                className="absolute left-2 inset-y-3 w-1 rounded-full bg-emerald-500"
              />
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500">
                  <CheckCircle2 className="size-4" />
                </div>
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {friendlyDate(r.checkedInAt)}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {formatSLTime(r.checkedInAt)}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium",
                      sourceStyle[r.source],
                    )}
                  >
                    {sourceLabel(r.source)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
