import { Database } from "lucide-react";
import { formatBytes, type DbUsage } from "@/lib/admin/db-usage";
import { cn } from "@/lib/utils";

/**
 * Compact database-storage gauge for the bottom of the admin sidebar. Shows
 * how much of the Supabase 500 MB database-size budget is used, with the bar
 * shifting green → amber → red as it fills. Presentational only.
 */
export function StorageMeter({ usedBytes, limitBytes, pct }: DbUsage) {
  const barColor =
    pct >= 90
      ? "bg-status-danger"
      : pct >= 75
        ? "bg-status-warning"
        : "bg-status-success";

  return (
    <div className="px-4 py-3 border-t border-sidebar-border">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-sidebar-foreground/80">
          <Database className="size-3.5" />
          Database
        </span>
        <span className="text-xs tabular-nums text-sidebar-foreground/60">
          {pct}%
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-sidebar-foreground/10"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Database storage ${pct}% used`}
      >
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          // Floor the visible width so a nearly-empty DB still shows a sliver.
          style={{ width: `${Math.max(pct, 1.5)}%` }}
        />
      </div>
      <div className="mt-1.5 text-[11px] tabular-nums text-sidebar-foreground/50">
        {formatBytes(usedBytes)} / {formatBytes(limitBytes)}
      </div>
    </div>
  );
}
