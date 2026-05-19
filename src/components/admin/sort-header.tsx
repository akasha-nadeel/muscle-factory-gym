import Link from "next/link";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ParsedSort } from "@/lib/sort-params";

export function SortHeader<T extends string>({
  field,
  label,
  current,
  hrefFor,
  align = "left",
  className,
}: {
  field: T;
  label: React.ReactNode;
  current: ParsedSort<T>;
  /** Caller provides the URL for this field's click (flip dir or sort desc). */
  hrefFor: (field: T) => string;
  align?: "left" | "right";
  className?: string;
}) {
  const isActive = current.field === field;
  const Icon = isActive
    ? current.dir === "asc"
      ? ChevronUp
      : ChevronDown
    : ChevronsUpDown;
  return (
    <TableHead className={className}>
      <Link
        href={hrefFor(field)}
        className={cn(
          "inline-flex items-center gap-1 select-none transition-colors hover:text-foreground",
          isActive ? "text-foreground" : "text-muted-foreground",
          align === "right" && "flex-row-reverse",
        )}
        aria-sort={
          isActive
            ? current.dir === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        {label}
        <Icon className="size-3.5 shrink-0 opacity-70" />
      </Link>
    </TableHead>
  );
}
