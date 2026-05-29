"use client";

import { useState } from "react";
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
import { Wallet, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const INITIAL_VISIBLE = 5;

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
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <EmptyState icon={Wallet} title="No payments yet" />
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
            Show all {rows.length} payments
          </>
        )}
      </Button>
    </div>
  ) : null;
  const mobileCards = visibleRows.map((r) => {
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
            <div className="text-sm font-medium capitalize">{r.kind}</div>
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
              {isNegative ? "-" : ""}LKR {Math.abs(num).toLocaleString()}
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
  });

  const desktopRows = visibleRows.map((r) => {
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
  });

  return (
    <>
      {/* Mobile: payment cards. Amount right-aligned (eye-anchor),
          status pill below it, kind+method on the left, refund action
          at bottom when applicable. Mirrors Stripe / Revolut. Capped at
          5 initially with a "Show all N payments" toggle so members
          with long history don't force endless scrolling. */}
      <div className="sm:hidden space-y-2">
        {mobileCards}
        {toggleButton}
      </div>

      {/* Tablet / desktop: table with the same show-more cap. Button
          sits OUTSIDE the table (not inside TableBody) to keep the HTML
          structure valid. */}
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
          <TableBody>{desktopRows}</TableBody>
        </Table>
        {toggleButton}
      </div>
    </>
  );
}
