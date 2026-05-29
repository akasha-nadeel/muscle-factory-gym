"use client";

import { useState } from "react";
import { Wallet, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/admin/status-pill";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const INITIAL_VISIBLE = 5;

type PaymentRow = {
  id: string;
  amountLkr: string;
  method: "cash" | "bank_transfer" | "payhere";
  kind: "membership" | "admission";
  status: "pending" | "succeeded" | "failed" | "refunded";
  paidAt: Date;
};

function methodLabel(m: PaymentRow["method"]): string {
  if (m === "bank_transfer") return "Bank transfer";
  if (m === "payhere") return "PayHere";
  return "Cash";
}

export function PaymentList({ rows }: { rows: PaymentRow[] }) {
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-4 py-8 text-center">
        <div className="size-12 rounded-full bg-muted/50 text-muted-foreground inline-flex items-center justify-center mb-3">
          <Wallet className="size-6" />
        </div>
        <p className="text-sm font-medium">No payments yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Your payment history will appear here.
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
      {visible.map((p) => {
        const num = Number(p.amountLkr);
        const isNegative = num < 0;
        const isRefunded = p.status === "refunded";
        return (
          <div
            key={p.id}
            className={cn(
              "rounded-xl border bg-card p-3 transition-opacity",
              isRefunded ? "opacity-70" : "",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium capitalize">{p.kind}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {methodLabel(p.method)} · {format(p.paidAt, "MMM d, yyyy")}
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
                  <StatusPill variant={p.status}>{p.status}</StatusPill>
                </div>
              </div>
            </div>
          </div>
        );
      })}
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
                Show all {rows.length} payments
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
