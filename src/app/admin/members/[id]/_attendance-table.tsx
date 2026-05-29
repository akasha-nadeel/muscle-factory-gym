"use client";

import { useState } from "react";
import { formatSLDateTime } from "@/lib/tz";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/admin/empty-state";
import { Activity, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const INITIAL_VISIBLE = 5;

export type AttendanceRow = {
  id: string;
  checkedInAt: Date;
  source: "qr_scan" | "manual" | "kiosk_id";
};

function sourceLabel(s: AttendanceRow["source"]) {
  switch (s) {
    case "kiosk_id":
      return "Kiosk";
    case "qr_scan":
      return "QR scan";
    case "manual":
      return "Manual";
  }
}

export function AttendanceTable({ rows }: { rows: AttendanceRow[] }) {
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <EmptyState icon={Activity} title="No check-ins yet" />
      </div>
    );
  }

  const visibleRows =
    expanded || rows.length <= INITIAL_VISIBLE
      ? rows
      : rows.slice(0, INITIAL_VISIBLE);
  const hasMore = rows.length > INITIAL_VISIBLE;

  const toggleButton = hasMore ? (
    <div className="flex justify-center pt-3">
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
  ) : null;

  return (
    <>
      {/* Mobile: activity-feed cards (Strava / Apple Fitness pattern).
          Capped at 5 with "Show all N check-ins" toggle. */}
      <ul className="sm:hidden space-y-2">
        {visibleRows.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-3 rounded-xl border bg-card p-3"
          >
            <div className="shrink-0 size-9 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {formatSLDateTime(r.checkedInAt)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {sourceLabel(r.source)}
              </div>
            </div>
          </li>
        ))}
        {toggleButton}
      </ul>

      {/* Tablet / desktop: table, same show-more cap. Button sits OUTSIDE
          TableBody for valid HTML. */}
      <div className="hidden sm:block">
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">Checked in at</TableHead>
                <TableHead className="w-32">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatSLDateTime(r.checkedInAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{sourceLabel(r.source)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {toggleButton}
      </div>
    </>
  );
}
