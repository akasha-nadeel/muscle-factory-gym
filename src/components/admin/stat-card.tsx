import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type StatCardAccent = "red" | "green" | "amber" | "blue" | "default";

/**
 * Explicit Tailwind colors (not theme tokens) so the cards look the same in
 * light and dark mode. Using --primary etc. would tint Total Revenue with
 * the brand red, which is not what we want.
 */
const iconBg: Record<StatCardAccent, string> = {
  red: "bg-rose-500/25 text-rose-500",
  green: "bg-emerald-500/25 text-emerald-500",
  amber: "bg-amber-500/25 text-amber-500",
  blue: "bg-sky-500/25 text-sky-500",
  default: "bg-muted text-muted-foreground",
};

const cardSurface: Record<StatCardAccent, string> = {
  red: "bg-rose-500/10 border-rose-500/30",
  green: "bg-emerald-500/10 border-emerald-500/30",
  amber: "bg-amber-500/10 border-amber-500/30",
  blue: "bg-sky-500/10 border-sky-500/30",
  default: "bg-card",
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
        "rounded-xl border p-5 flex items-start gap-4 transition-colors",
        cardSurface[accentColor],
        className,
      )}
    >
      <div
        className={cn(
          "size-10 rounded-lg flex items-center justify-center shrink-0",
          iconBg[accentColor],
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
