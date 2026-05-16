import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusPill } from "@/components/admin/status-pill";
import { format } from "date-fns";
import { RefundButton } from "./_refund-button";

type Row = {
  id: string;
  amountLkr: string;
  method: "cash" | "bank_transfer" | "payhere";
  kind: "membership" | "admission";
  status: "pending" | "succeeded" | "failed" | "refunded";
  reference: string | null;
  paidAt: Date;
};

export function PaymentsTable({
  rows,
  refundedReferences,
}: {
  rows: Row[];
  refundedReferences: Set<string>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Paid at</TableHead>
          <TableHead className="w-28">Kind</TableHead>
          <TableHead className="w-28">Method</TableHead>
          <TableHead className="w-32 text-right">Amount (LKR)</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead className="w-32">Status</TableHead>
          <TableHead className="w-24 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={7}
              className="text-center text-muted-foreground py-6"
            >
              No payments yet.
            </TableCell>
          </TableRow>
        )}
        {rows.map((r) => {
          const num = Number(r.amountLkr);
          const isRefundRow = r.status === "refunded";
          const canRefund =
            r.status === "succeeded" &&
            (!r.reference || !refundedReferences.has(r.reference));
          return (
            <TableRow key={r.id} className={isRefundRow ? "opacity-70" : ""}>
              <TableCell>{format(r.paidAt, "PP")}</TableCell>
              <TableCell>{r.kind}</TableCell>
              <TableCell>{r.method}</TableCell>
              <TableCell className="text-right">
                {num < 0 ? "-" : ""}
                {Math.abs(num).toLocaleString()}
              </TableCell>
              <TableCell>{r.reference ?? "—"}</TableCell>
              <TableCell>
                <StatusPill variant={r.status}>{r.status}</StatusPill>
              </TableCell>
              <TableCell className="text-right">
                {canRefund && (
                  <RefundButton
                    paymentId={r.id}
                    amountLabel={`LKR ${num.toLocaleString()}`}
                  />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
