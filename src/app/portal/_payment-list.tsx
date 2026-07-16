"use client";

import { useState } from "react";
import { Wallet, CalendarCheck, Ticket } from "lucide-react";
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

// Accent bar + icon tint keyed off the payment status — the colour cue the
// reference cards use down their left edge.
const statusAccent: Record<
  PaymentRow["status"],
  { bar: string; icon: string }
> = {
  succeeded: { bar: "bg-emerald-500", icon: "bg-emerald-500/15 text-emerald-500" },
  pending: { bar: "bg-amber-500", icon: "bg-amber-500/15 text-amber-500" },
  failed: { bar: "bg-rose-500", icon: "bg-rose-500/15 text-rose-500" },
  refunded: {
    bar: "bg-muted-foreground/40",
    icon: "bg-muted text-muted-foreground",
  },
};

export function PaymentList({
  rows,
  title,
}: {
  rows: PaymentRow[];
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
            <Wallet className="size-6" />
          </div>
          <p className="text-sm font-medium">No payments yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Your payment history will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((p) => {
        const num = Number(p.amountLkr);
        const isNegative = num < 0;
        const isRefunded = p.status === "refunded";
        const accent = statusAccent[p.status];
        const Icon = p.kind === "admission" ? Ticket : CalendarCheck;
        return (
          <div
            key={p.id}
            className={cn(
              "relative rounded-xl border bg-card p-3 pl-5 transition-opacity",
              isRefunded && "opacity-70",
            )}
          >
            {/* Left accent bar (reference style). */}
            <span
              aria-hidden
              className={cn(
                "absolute left-2 inset-y-3 w-1 rounded-full",
                accent.bar,
              )}
            />
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  accent.icon,
                )}
              >
                <Icon className="size-4" />
              </div>
              <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold capitalize">
                    {p.kind}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {methodLabel(p.method)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="mb-1 inline-flex">
                    <StatusPill variant={p.status}>{p.status}</StatusPill>
                  </div>
                  <div
                    className={cn(
                      "text-base font-semibold tabular-nums",
                      isNegative && "text-rose-500",
                    )}
                  >
                    {isNegative ? "-" : ""}LKR {Math.abs(num).toLocaleString()}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {format(p.paidAt, "MMM d, yyyy")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
          })}
        </div>
      )}
    </div>
  );
}
