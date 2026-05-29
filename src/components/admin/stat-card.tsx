import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type StatCardAccent = "red" | "green" | "amber" | "blue" | "default";

/**
 * Length-keyed font sizing that pairs with @container on the card root.
 * Returns the COMPLETE size stack (base + container query upscales) so
 * short values get prominent treatment AND long values cap low enough
 * to fit in narrow grids.
 *
 * Examples:
 *  - "3" (1 char) → text-2xl baseline, text-3xl when card has room
 *  - "Monthly" (7 chars) → text-lg baseline, scales up to text-2xl
 *  - "LKR 5,499.99" (12 chars) → text-base baseline, up to text-2xl
 *  - "LKR 9,999,999.99" (16 chars) → text-sm baseline, caps at text-lg
 */
function valueSizeClass(value: string | number): string {
  const len = String(value).length;
  // Very short — always large; "3" / "0" should dominate the card.
  if (len <= 3) return "text-2xl @[14rem]:text-3xl";
  // Short — "LKR 0", "Done"
  if (len <= 6) return "text-xl @[10rem]:text-2xl @[16rem]:text-3xl";
  // Short-medium — "Monthly", "Settled", "LKR 999"
  if (len <= 9) return "text-lg @[10rem]:text-xl @[14rem]:text-2xl";
  // Medium — "LKR 1,000.50", "LKR 5,499.99"
  if (len <= 12)
    return "text-base @[12rem]:text-lg @[16rem]:text-xl @[20rem]:text-2xl";
  // Long — "LKR 25,332.63", "LKR 99,999.99"
  if (len <= 15)
    return "text-sm @[14rem]:text-base @[18rem]:text-lg @[22rem]:text-xl";
  // Very long — "LKR 1,234,567.89"+
  return "text-sm @[18rem]:text-base @[22rem]:text-lg";
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
        // @container makes the value font size respond to the card's own
        // width (not the viewport), so a 4-col grid card and a 1-col mobile
        // card auto-pick the right size with no manual breakpoints.
        "@container rounded-xl border p-3 flex items-start gap-2.5 transition-colors",
        cardSurface[accentColor],
        className,
      )}
    >
      <div
        className={cn(
          "size-8 rounded-lg flex items-center justify-center shrink-0",
          iconBg[accentColor],
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground truncate">
          {label}
        </div>
        {/* Value font scales with the card's own width via @container
            queries. Length-keyed baseline ensures short values like "3"
            or "0" are visually prominent (text-2xl) while long values
            like "LKR 9,999,999.99" cap low enough to fit. truncate is
            the final safety net. */}
        <div
          className={cn(
            "font-semibold tabular-nums mt-1 whitespace-nowrap truncate",
            valueSizeClass(value),
          )}
        >
          {value}
        </div>
        {caption && (
          <div className="text-[0.65rem] @[14rem]:text-xs text-muted-foreground mt-1 line-clamp-2">
            {caption}
          </div>
        )}
      </div>
    </div>
  );
}
