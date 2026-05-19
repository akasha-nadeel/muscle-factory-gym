import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type StatCardAccent = "red" | "green" | "amber" | "blue" | "default";

const accentBg: Record<StatCardAccent, string> = {
  red: "bg-status-danger-bg text-status-danger",
  green: "bg-status-success-bg text-status-success",
  amber: "bg-status-warning-bg text-status-warning",
  blue: "bg-primary/10 text-primary",
  default: "bg-muted text-muted-foreground",
};

export function StatCard({
  icon: Icon,
  label,
  value,
  caption,
  accentColor = "default",
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  caption?: string;
  accentColor?: StatCardAccent;
  className?: string;
}) {
  return (
    <div
      data-slot="stat-card"
      className={cn(
        "rounded-xl border bg-card p-5 flex items-start gap-4 transition-colors",
        className,
      )}
    >
      <div
        className={cn(
          "size-10 rounded-lg flex items-center justify-center shrink-0",
          accentBg[accentColor],
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
        {caption && (
          <div className="text-xs text-muted-foreground mt-1">{caption}</div>
        )}
      </div>
    </div>
  );
}
