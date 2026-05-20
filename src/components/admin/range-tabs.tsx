"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type RangeKey = "today" | "week" | "month";

const labels: Record<RangeKey, string> = {
  today: "Today",
  week: "Week",
  month: "Month",
};

export function RangeTabs({
  current,
  paramName = "range",
}: {
  current: RangeKey;
  /** Lets each panel use its own search-param key if both ever go on one page. */
  paramName?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefFor(k: RangeKey): string {
    const params = new URLSearchParams(searchParams.toString());
    if (k === "today") params.delete(paramName);
    else params.set(paramName, k);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-md bg-muted/40 p-0.5 text-xs">
      {(Object.keys(labels) as RangeKey[]).map((k) => {
        const active = k === current;
        return (
          <Link
            key={k}
            href={hrefFor(k)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "px-2.5 py-1 rounded-[5px] transition-colors",
              active
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {labels[k]}
          </Link>
        );
      })}
    </div>
  );
}
