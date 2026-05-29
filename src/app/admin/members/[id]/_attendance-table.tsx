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
import { Activity, CheckCircle2 } from "lucide-react";

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
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <EmptyState icon={Activity} title="No check-ins yet" />
      </div>
    );
  }
  return (
    <>
      {/* Mobile: activity-feed cards. Each check-in is one event, datetime
          as the headline (since "what happened" here = "they came in"),
          source as muted metadata + colored icon to convey activity.
          Inspired by Strava / Apple Fitness activity rows. */}
      <ul className="sm:hidden space-y-2">
        {rows.map((r) => (
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
      </ul>

      {/* Tablet / desktop: existing table. */}
      <div className="hidden sm:block rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">Checked in at</TableHead>
              <TableHead className="w-32">Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
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
    </>
  );
}
