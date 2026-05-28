import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type StatCardAccent = "red" | "green" | "amber" | "blue" | "default";

/**
 * Pick a font size for the value based on its rendered character length.
 * Short values get the standard text-2xl; longer ones step down so the
 * full string still fits inside a 4-up card grid without wrapping or
 * truncating, even at the narrow viewports where each card is ~200px
 * (e.g. desktop with DevTools open, or the portal's 4-col layout at
 * lg breakpoint).
 */
function valueFontSize(value: string | number): string {
  const len = String(value).length;
  if (len <= 8) return "text-2xl";  // "LKR 999"
  if (len <= 11) return "text-xl";  // "LKR 9,999"
  if (len <= 14) return "text-lg";  // "LKR 99,999.99"
  if (len <= 18) return "text-base"; // "LKR 999,999.99"
  return "text-sm";                  // 1M+ with decimals — still readable
}

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
        {/* Auto-shrink the value font based on string length so long
            full-precision numbers (e.g. "LKR 1,234,567.89") still fit on
            one line without changing the card height. nowrap + truncate
            are safety nets for anything unexpectedly long. */}
        <div
          className={cn(
            "font-semibold tabular-nums mt-1 whitespace-nowrap truncate",
            valueFontSize(value),
          )}
        >
          {value}
        </div>
        {caption && (
          <div className="text-xs text-muted-foreground mt-1">{caption}</div>
        )}
      </div>
    </div>
  );
}
