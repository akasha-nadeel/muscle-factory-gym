import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-48">Checked in at</TableHead>
          <TableHead className="w-32">Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={2} className="text-center text-muted-foreground py-6">
              No check-ins yet.
            </TableCell>
          </TableRow>
        )}
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{format(r.checkedInAt, "PPp")}</TableCell>
            <TableCell>
              <Badge variant="outline">{sourceLabel(r.source)}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
