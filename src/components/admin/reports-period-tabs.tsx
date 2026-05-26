"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type ReportsPeriod = "12mo" | "ytd" | "all";

const labels: Record<ReportsPeriod, string> = {
  "12mo": "Last 12 months",
  ytd: "This year",
  all: "All time",
};

export function ReportsPeriodTabs({ current }: { current: ReportsPeriod }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefFor(p: ReportsPeriod): string {
    const params = new URLSearchParams(searchParams.toString());
    // 12mo is the default — keep the URL clean by omitting the param.
    if (p === "12mo") params.delete("period");
    else params.set("period", p);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-md bg-muted/40 p-0.5 text-xs">
      {(Object.keys(labels) as ReportsPeriod[]).map((p) => {
        const active = p === current;
        return (
          <Link
            key={p}
            href={hrefFor(p)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "px-2.5 py-1 rounded-[5px] transition-colors whitespace-nowrap",
              active
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {labels[p]}
          </Link>
        );
      })}
    </div>
  );
}
