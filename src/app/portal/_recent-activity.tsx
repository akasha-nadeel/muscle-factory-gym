"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatSLDate, formatSLTime } from "@/lib/tz";

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

export function RecentActivity({ rows }: { rows: AttendanceRow[] }) {
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) {
    return (
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
    );
  }

  const visible =
    expanded || rows.length <= INITIAL_VISIBLE
      ? rows
      : rows.slice(0, INITIAL_VISIBLE);
  const hasMore = rows.length > INITIAL_VISIBLE;

  return (
    <div className="space-y-2">
      {visible.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-3 rounded-xl border bg-card p-3"
        >
          <div className="shrink-0 size-9 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
            <CheckCircle2 className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">
              {friendlyDate(r.checkedInAt)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {formatSLTime(r.checkedInAt)}
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 font-normal">
            {sourceLabel(r.source)}
          </Badge>
        </div>
      ))}
      {hasMore && (
        <div className="flex justify-center pt-1">
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
                Show all {rows.length} check-ins
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
