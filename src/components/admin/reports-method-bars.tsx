"use client";

import { Banknote, Building2 } from "lucide-react";

/**
 * Compact two-row breakdown of cash vs bank receipts. Skips a chart library
 * since two values render cleaner as labelled bars than as a recharts plot.
 */
export function ReportsMethodBars({
  cash,
  bank,
}: {
  cash: number;
  bank: number;
}) {
  const total = cash + bank;
  const cashPct = total > 0 ? (cash / total) * 100 : 0;
  const bankPct = total > 0 ? (bank / total) * 100 : 0;

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h4 className="text-sm font-medium">Payment methods</h4>
        <span className="text-xs text-muted-foreground tabular-nums">
          LKR {total.toLocaleString()}
        </span>
      </div>
      {total === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center">
          No payments recorded in this period.
        </div>
      ) : (
        <div className="space-y-4">
          <Row
            icon={<Banknote className="size-4" />}
            label="Cash"
            value={cash}
            pct={cashPct}
            color="bg-emerald-500"
          />
          <Row
            icon={<Building2 className="size-4" />}
            label="Bank transfer"
            value={bank}
            pct={bankPct}
            color="bg-sky-500"
          />
        </div>
      )}
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  pct,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  pct: number;
  color: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="tabular-nums">
          <span className="font-medium">LKR {value.toLocaleString()}</span>
          <span className="text-muted-foreground ml-2 text-xs">
            {pct.toFixed(0)}%
          </span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
