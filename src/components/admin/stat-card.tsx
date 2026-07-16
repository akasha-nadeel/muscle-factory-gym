import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type StatCardAccent = "red" | "green" | "amber" | "blue" | "default";

/**
 * Length-keyed font sizing that pairs with @container on the card root.
 * Returns the COMPLETE size stack (base + container query upscales).
 *
 * The BASELINE (before any @[…] query) must fit the narrowest card we
 * ship: a 2-col grid on a ~331px phone yields a ~143px card, of which
 * only ~78px is left for the value after the icon + gap + padding. So
 * baselines are sized to fit that width and the @container queries scale
 * UP as the card gets wider (single-column, tablet, desktop 4-col). This
 * is what keeps "LKR 5,000" from truncating to "LKR 5,…" on mobile while
 * still rendering big on a wide admin card.
 *
 * Examples (baseline → widest):
 *  - "42" (2 chars) → text-2xl → text-3xl
 *  - "Monthly" (7 chars) → text-sm → text-2xl
 *  - "LKR 25,000" (10 chars) → text-xs → text-2xl
 *  - "LKR 1,234,567" (13 chars) → text-xs → text-xl
 */
function valueSizeClass(value: string | number): string {
  const len = String(value).length;
  // Very short — always large; "3" / "0" / "42" should dominate the card.
  if (len <= 3) return "text-2xl @[9rem]:text-3xl";
  // Short — "LKR 0", "Done", "LKR 99"
  if (len <= 6) return "text-xl @[10rem]:text-2xl @[16rem]:text-3xl";
  // Short-medium — "Monthly", "Settled", "LKR 5,000"
  if (len <= 9)
    return "text-sm @[10rem]:text-base @[12rem]:text-lg @[14rem]:text-xl @[18rem]:text-2xl";
  // Medium — "LKR 25,000", "LKR 1,000.50"
  if (len <= 12)
    return "text-xs @[10rem]:text-sm @[12rem]:text-base @[16rem]:text-lg @[20rem]:text-xl @[24rem]:text-2xl";
  // Long — "LKR 250,332", "LKR 99,999.99"
  if (len <= 15)
    return "text-xs @[12rem]:text-sm @[16rem]:text-base @[20rem]:text-lg @[24rem]:text-xl";
  // Very long — "LKR 1,234,567.89"+
  return "text-xs @[14rem]:text-sm @[18rem]:text-base @[24rem]:text-lg";
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

/**
 * Solid, vivid icon squares for the "stack" variant. In that layout the
 * card itself is a uniform dark surface and ALL the colour lives in the
 * icon tile at the top (matching the reference design).
 */
const iconBgSolid: Record<StatCardAccent, string> = {
  red: "bg-rose-500 text-white",
  green: "bg-emerald-500 text-white",
  amber: "bg-amber-500 text-white",
  blue: "bg-sky-500 text-white",
  default: "bg-muted text-muted-foreground",
};

/**
 * Card surface for the "stack" variant: a near-black card with a subtle
 * accent-coloured gradient bleeding in from the top-left (behind the icon),
 * fading to the flat card colour. Matches the reference — the tint is felt,
 * not seen. Same `from-{accent}/10 via-card to-card` recipe the admin
 * overview hero cards use.
 */
const cardSurfaceStack: Record<StatCardAccent, string> = {
  red: "bg-gradient-to-br from-rose-500/10 via-card to-card border-border/60",
  green: "bg-gradient-to-br from-emerald-500/10 via-card to-card border-border/60",
  amber: "bg-gradient-to-br from-amber-500/10 via-card to-card border-border/60",
  blue: "bg-gradient-to-br from-sky-500/10 via-card to-card border-border/60",
  default: "bg-card border-border/60",
};

/**
 * Value sizing for the "stack" variant. Here the value spans the full card
 * width (it's below the icon, not beside it), so it can render larger than
 * the compact row layout allows. Still @container-keyed so it scales with
 * the card's own width.
 */
function stackValueSizeClass(value: string | number): string {
  const len = String(value).length;
  if (len <= 3) return "text-3xl @[9rem]:text-4xl";
  if (len <= 6) return "text-2xl @[10rem]:text-3xl";
  if (len <= 9) return "text-xl @[10rem]:text-2xl @[16rem]:text-3xl";
  if (len <= 12) return "text-lg @[10rem]:text-xl @[16rem]:text-2xl";
  if (len <= 15) return "text-base @[12rem]:text-lg @[18rem]:text-xl";
  return "text-sm @[14rem]:text-base @[20rem]:text-lg";
}

export function StatCard({
  icon: Icon,
  label,
  value,
  caption,
  accentColor = "default",
  variant = "row",
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  caption?: string;
  accentColor?: StatCardAccent;
  /** "row": compact icon-left layout (admin). "stack": icon-on-top,
   *  uniform dark card with a vivid icon tile (portal / reference style). */
  variant?: "row" | "stack";
  className?: string;
}) {
  if (variant === "stack") {
    return (
      <div
        data-slot="stat-card"
        className={cn(
          "@container flex flex-col gap-3 rounded-2xl border p-3.5 transition-colors sm:p-4",
          cardSurfaceStack[accentColor],
          className,
        )}
      >
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-xl",
            iconBgSolid[accentColor],
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          <div
            className={cn(
              "mt-1 truncate font-semibold tabular-nums whitespace-nowrap",
              stackValueSizeClass(value),
            )}
          >
            {value}
          </div>
          {caption && (
            <div className="mt-1 line-clamp-2 text-[0.7rem] text-muted-foreground">
              {caption}
            </div>
          )}
        </div>
      </div>
    );
  }

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
