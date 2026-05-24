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
import { Activity } from "lucide-react";

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
    <div className="rounded-lg border bg-card">
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
  );
}
