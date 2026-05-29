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
import { EmptyState } from "@/components/admin/empty-state";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  amountLkr: string;
  method: "cash" | "bank_transfer" | "payhere";
  kind: "membership" | "admission";
  status: "pending" | "succeeded" | "failed" | "refunded";
  reference: string | null;
  paidAt: Date;
};

function methodLabel(m: Row["method"]): string {
  if (m === "bank_transfer") return "Bank transfer";
  if (m === "payhere") return "PayHere";
  return "Cash";
}

export function PaymentsTable({
  rows,
  refundedReferences,
}: {
  rows: Row[];
  refundedReferences: Set<string>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <EmptyState icon={Wallet} title="No payments yet" />
      </div>
    );
  }
  return (
    <>
      {/* Mobile: payment cards. Senior pattern: amount as the eye-anchor
          (right-aligned at top, tabular-nums), status pill below it,
          kind+method as muted metadata on the left, refund action at
          bottom when applicable. Mirrors Stripe / Revolut transaction
          list patterns. */}
      <div className="sm:hidden space-y-2">
        {rows.map((r) => {
          const num = Number(r.amountLkr);
          const isRefundRow = r.status === "refunded";
          const isNegative = num < 0;
          const canRefund =
            r.status === "succeeded" &&
            (!r.reference || !refundedReferences.has(r.reference));
          return (
            <div
              key={r.id}
              className={cn(
                "rounded-xl border bg-card p-3 space-y-2 transition-opacity",
                isRefundRow ? "opacity-70" : "",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium capitalize">
                    {r.kind}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {methodLabel(r.method)} · {format(r.paidAt, "MMM d, yyyy")}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={cn(
                      "text-base font-semibold tabular-nums",
                      isNegative ? "text-rose-500" : "",
                    )}
                  >
                    {isNegative ? "-" : ""}LKR{" "}
                    {Math.abs(num).toLocaleString()}
                  </div>
                  <div className="mt-1 inline-flex">
                    <StatusPill variant={r.status}>{r.status}</StatusPill>
                  </div>
                </div>
              </div>
              {r.reference && (
                <div className="text-xs text-muted-foreground font-mono truncate">
                  Ref: {r.reference}
                </div>
              )}
              {canRefund && (
                <div className="flex justify-end pt-1">
                  <RefundButton
                    paymentId={r.id}
                    amountLabel={`LKR ${num.toLocaleString()}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tablet / desktop: existing table, wrapped so it's hidden on mobile. */}
      <div className="hidden sm:block">
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
            {rows.map((r) => {
              const num = Number(r.amountLkr);
              const isRefundRow = r.status === "refunded";
              const canRefund =
                r.status === "succeeded" &&
                (!r.reference || !refundedReferences.has(r.reference));
              return (
                <TableRow
                  key={r.id}
                  className={isRefundRow ? "opacity-70" : ""}
                >
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
      </div>
    </>
  );
}
